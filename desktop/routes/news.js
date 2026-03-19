const { Router } = require('express');
const axios = require('axios');
const crypto = require('crypto');
const AIDecisionEngine = require('./ai_engine');
let OpenAI;
try { OpenAI = require('openai'); } catch (_) { OpenAI = null; }

function uuid() { return crypto.randomUUID(); }

module.exports = function (db) {
  const router = Router();
  const aiEngine = new AIDecisionEngine(db);

  // Instrument configs for signal generation
  const INSTRUMENTS = {
    NIFTY50: { base_price: 24000, strike_step: 50 },
    BANKNIFTY: { base_price: 52000, strike_step: 100 },
    FINNIFTY: { base_price: 23800, strike_step: 50 },
    MIDCPNIFTY: { base_price: 12000, strike_step: 25 },
    SENSEX: { base_price: 79800, strike_step: 100 },
    BANKEX: { base_price: 55000, strike_step: 100 },
  };

  // ============ Simple RSS Parser (no dependencies) ============
  function stripHtml(str) {
    return (str || '')
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseRSS(xml) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const get = (tag) => {
        const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return stripHtml(m ? (m[1] || m[2] || '') : '');
      };
      items.push({ title: get('title'), description: get('description'), link: get('link'), pubDate: get('pubDate') });
    }
    return items;
  }

  // ============ Sentiment Analysis ============

  // Track recent sentiments for trend-aware scoring
  const recentSentiments = [];

  function getTrendAdjustment(currentSentiment) {
    if (recentSentiments.length < 3) return 0;
    const recent = recentSentiments.slice(-5);
    const sameCount = recent.filter(s => s.sentiment === currentSentiment).length;
    if (sameCount >= 4) return 8;
    if (sameCount >= 3) return 4;
    if (sameCount <= 1) return -5;
    return 0;
  }

  function detectSector(text) {
    const t = text.toLowerCase();
    const sectors = {
      BANKING: ['bank', 'nifty bank', 'banknifty', 'rbi', 'interest rate', 'repo rate', 'credit', 'loan', 'npa', 'hdfc', 'icici', 'sbi', 'kotak', 'axis bank'],
      IT: ['it sector', 'tech', 'infosys', 'tcs', 'wipro', 'hcl tech', 'software', 'digital', 'ai ', 'artificial intelligence'],
      PHARMA: ['pharma', 'drug', 'medicine', 'health', 'hospital', 'vaccine', 'fda', 'cipla', 'sun pharma', 'dr reddy'],
      AUTO: ['auto', 'vehicle', 'car', 'tata motors', 'maruti', 'mahindra', 'ev ', 'electric vehicle'],
      ENERGY: ['oil', 'gas', 'energy', 'reliance', 'ongc', 'crude', 'petrol', 'diesel', 'power', 'solar', 'renewable'],
      METAL: ['metal', 'steel', 'iron', 'copper', 'aluminium', 'tata steel', 'jsw', 'hindalco', 'vedanta'],
      FMCG: ['fmcg', 'consumer', 'itc', 'hindustan unilever', 'nestle', 'britannia', 'food', 'retail'],
    };
    for (const [sector, keywords] of Object.entries(sectors)) {
      if (keywords.some(kw => t.includes(kw))) return sector;
    }
    return 'BROAD_MARKET';
  }

  // Enhanced keyword-based fallback with weighted scoring
  function keywordSentiment(article) {
    const text = `${article.title || ''} ${article.description || ''}`.toLowerCase();

    const bullishHigh = ['all-time high', 'record high', 'massive rally', 'strong earnings', 'rate cut', 'fii buying', 'breakout'];
    const bullishMid = ['rally', 'surge', 'gain', 'bull', 'positive', 'boost', 'growth', 'profit', 'upgrade', 'outperform', 'recovery', 'inflows', 'green', 'uptrend', 'bullish', 'optimism'];
    const bullishLow = ['rise', 'high', 'strong', 'buy', 'good', 'better', 'stable'];

    const bearishHigh = ['crash', 'panic selling', 'circuit break', 'recession', 'rate hike', 'fii selling', 'meltdown'];
    const bearishMid = ['fall', 'drop', 'decline', 'bear', 'negative', 'weak', 'loss', 'fear', 'downgrade', 'underperform', 'correction', 'outflows', 'red', 'downtrend', 'bearish', 'pressure', 'slump'];
    const bearishLow = ['sell', 'low', 'warning', 'concern', 'risk', 'inflation', 'uncertainty'];

    let bullScore = bullishHigh.filter(kw => text.includes(kw)).length * 3;
    bullScore += bullishMid.filter(kw => text.includes(kw)).length * 2;
    bullScore += bullishLow.filter(kw => text.includes(kw)).length;

    let bearScore = bearishHigh.filter(kw => text.includes(kw)).length * 3;
    bearScore += bearishMid.filter(kw => text.includes(kw)).length * 2;
    bearScore += bearishLow.filter(kw => text.includes(kw)).length;

    const total = bullScore + bearScore;
    const sector = detectSector(text);

    if (total === 0) return { sentiment: 'NEUTRAL', confidence: 50, impact: 'LOW', sector, reason: 'No strong keywords detected (keyword analysis)', trading_signal: 'HOLD' };

    const dominant = bullScore > bearScore ? 'BULLISH' : bearScore > bullScore ? 'BEARISH' : 'NEUTRAL';
    const diff = Math.abs(bullScore - bearScore);
    let confidence = Math.min(90, 50 + diff * 5);
    const impact = diff >= 6 ? 'HIGH' : diff >= 3 ? 'MEDIUM' : 'LOW';

    // Apply trend adjustment
    const trendAdj = getTrendAdjustment(dominant);
    confidence = Math.max(30, Math.min(95, confidence + trendAdj));

    let signal = 'HOLD';
    if (dominant === 'BULLISH' && confidence >= 63 && impact !== 'LOW') signal = 'BUY_CALL';
    else if (dominant === 'BEARISH' && confidence >= 63 && impact !== 'LOW') signal = 'BUY_PUT';

    const allKw = dominant === 'BULLISH' ? [...bullishHigh, ...bullishMid] : [...bearishHigh, ...bearishMid];
    const matched = allKw.filter(kw => text.includes(kw)).slice(0, 4);
    const reason = dominant !== 'NEUTRAL'
      ? `${dominant.charAt(0) + dominant.slice(1).toLowerCase()} signals [${sector}]: ${matched.join(', ')} (keyword analysis)`
      : `Mixed signals [${sector}] (keyword analysis)`;

    return { sentiment: dominant, confidence, impact, sector, reason, trading_signal: signal };
  }

  async function analyzeSentiment(article) {
    const aiKey = db.data.settings?.ai?.emergent_llm_key || '';

    // Calculate freshness score
    const freshnessScore = aiEngine.calculateFreshnessScore(article.published_at || new Date().toISOString());

    // Use AI if key available
    if (aiKey && OpenAI) {
      try {
        const client = new OpenAI({ apiKey: aiKey, baseURL: 'https://integrations.emergentagent.com/llm' });

        // Use enhanced system prompt with market context
        const systemMsg = aiEngine.getEnhancedSystemPrompt();

        const userMsg = `Title: ${article.title || ''}\nDescription: ${article.description || ''}\nSource: ${article.source || ''}\nPublished: ${article.published_at || ''}\nFreshness Score: ${freshnessScore}/100`;

        const completion = await client.chat.completions.create({
          model: 'openai/gpt-4.1-mini',
          messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }],
          max_tokens: 500,
        });

        const result = parseEnhancedSentiment(completion.choices?.[0]?.message?.content || '');

        // Apply trend adjustment
        const trendAdj = getTrendAdjustment(result.sentiment);
        result.confidence = Math.max(30, Math.min(98, result.confidence + trendAdj));
        if (trendAdj !== 0) result.trend_note = `Confidence adjusted by ${trendAdj > 0 ? '+' : ''}${trendAdj} based on recent trend`;

        // Detect sector if AI didn't provide
        if (!result.sector) {
          result.sector = detectSector(`${article.title || ''} ${article.description || ''}`);
        }

        // Update AI engine with this sentiment
        aiEngine.updateSentimentWindows(result);
        aiEngine.updateSectorMomentum(result.sector, result.sentiment, result.confidence);
        aiEngine.addToSignalBuffer(result);

        // Compute multi-signal correlation
        const correlation = aiEngine.getCorrelationScore(result);
        result.correlation_score = correlation.score;
        result.correlation_detail = correlation.reason;

        // Compute multi-timeframe confluence
        const confluence = aiEngine.getTimeframeConfluence(result.sentiment);
        result.confluence_score = confluence.score;
        result.confluence_aligned = confluence.aligned;

        // Compute final composite score
        const historicalAdj = getHistoricalAdjustment(result.sector, result.sentiment);
        result.composite_score = aiEngine.computeFinalScore(result, correlation, confluence, freshnessScore, historicalAdj);
        result.freshness_score = freshnessScore;
        result.market_regime = aiEngine.marketRegime;

        // Override trading signal based on composite score and regime
        result.trading_signal = computeEnhancedSignal(result);

        recentSentiments.push(result);
        if (recentSentiments.length > 20) recentSentiments.splice(0, recentSentiments.length - 20);
        return result;
      } catch (err) {
        console.error('[Sentiment] AI error, falling back to keywords:', err.message);
      }
    }

    // Fallback: keyword-based analysis with AI engine integration
    const result = keywordSentiment(article);
    result.freshness_score = freshnessScore;

    aiEngine.updateSentimentWindows(result);
    aiEngine.updateSectorMomentum(result.sector, result.sentiment, result.confidence);
    aiEngine.addToSignalBuffer(result);

    const correlation = aiEngine.getCorrelationScore(result);
    result.correlation_score = correlation.score;
    const confluence = aiEngine.getTimeframeConfluence(result.sentiment);
    result.confluence_score = confluence.score;
    result.market_regime = aiEngine.marketRegime;
    result.trading_signal = computeEnhancedSignal(result);

    recentSentiments.push(result);
    if (recentSentiments.length > 20) recentSentiments.splice(0, recentSentiments.length - 20);
    return result;
  }

  // Enhanced signal decision with regime awareness
  function computeEnhancedSignal(result) {
    const regime = aiEngine.marketRegime;
    const composite = result.composite_score || result.confidence;
    const impact = result.impact || 'LOW';
    const sentiment = result.sentiment;

    // Minimum thresholds based on market regime
    let minConfidence = 65;
    if (regime === 'VOLATILE') minConfidence = 75;
    else if (regime === 'SIDEWAYS') minConfidence = 70;

    // Time-of-day check
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    const totalMin = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    if (totalMin >= 870 && totalMin <= 930) minConfidence = 80; // Closing hour

    if (composite >= minConfidence && impact !== 'LOW') {
      if (sentiment === 'BULLISH') return 'BUY_CALL';
      if (sentiment === 'BEARISH') return 'BUY_PUT';
    }
    return 'HOLD';
  }

  function getHistoricalAdjustment(sector, sentiment) {
    const patterns = db.data.historical_patterns || [];
    const matching = patterns.filter(p => p.sector === sector && p.sentiment === sentiment);
    if (matching.length < 3) return 0;
    const winRate = matching.filter(p => p.was_profitable).length / matching.length;
    if (winRate >= 0.7) return 5;
    if (winRate <= 0.3) return -8;
    return 0;
  }

  // Parse enhanced AI response with new fields
  function parseEnhancedSentiment(text) {
    const result = { sentiment: 'NEUTRAL', confidence: 50, impact: 'LOW', sector: 'BROAD_MARKET', reason: '', trading_signal: 'HOLD', volatility: 'STABLE', time_horizon: 'SHORT_TERM', risk_level: 'MEDIUM', secondary_sector: 'NONE' };
    for (const line of text.split('\n')) {
      const l = line.trim();
      if (l.startsWith('SENTIMENT:')) result.sentiment = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('CONFIDENCE:')) result.confidence = parseInt(l.split(':').slice(1).join(':').trim()) || 50;
      else if (l.startsWith('IMPACT:')) result.impact = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('SECTOR:')) result.sector = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('REASON:')) result.reason = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('TRADING_SIGNAL:')) result.trading_signal = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('VOLATILITY:')) result.volatility = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('TIME_HORIZON:')) result.time_horizon = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('RISK_LEVEL:')) result.risk_level = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('SECONDARY_SECTOR:')) result.secondary_sector = l.split(':').slice(1).join(':').trim();
    }
    return result;
  }

  // ============ News Sources ============

  // --- Moneycontrol RSS ---
  async function fetchFromMoneycontrol(max) {
    const feeds = [
      'https://www.moneycontrol.com/rss/marketreports.xml',
      'https://www.moneycontrol.com/rss/stocksnews.xml',
    ];
    const articles = [];
    for (const url of feeds) {
      try {
        const resp = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const items = parseRSS(resp.data);
        for (const item of items.slice(0, Math.ceil(max / feeds.length))) {
          articles.push({
            title: item.title, description: item.description, content: item.description,
            source: 'Moneycontrol', url: item.link,
            published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
          });
        }
      } catch (e) { console.error('[News] Moneycontrol RSS error:', e.message); }
    }
    return articles.slice(0, max);
  }

  // --- Economic Times RSS ---
  async function fetchFromEconomicTimes(max) {
    const feeds = [
      'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
      'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms',
    ];
    const articles = [];
    for (const url of feeds) {
      try {
        const resp = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const items = parseRSS(resp.data);
        for (const item of items.slice(0, Math.ceil(max / feeds.length))) {
          articles.push({
            title: item.title, description: item.description, content: item.description,
            source: 'Economic Times', url: item.link,
            published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
          });
        }
      } catch (e) { console.error('[News] ET RSS error:', e.message); }
    }
    return articles.slice(0, max);
  }

  // --- NSE India ---
  async function fetchFromNSEIndia(max) {
    const articles = [];
    try {
      // NSE needs session cookie first
      const session = axios.create({
        baseURL: 'https://www.nseindia.com',
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      // Get cookies
      const homeResp = await session.get('/', { maxRedirects: 5 });
      const cookies = (homeResp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

      // Fetch market status / corporate announcements
      const resp = await session.get('/api/corporate-announcements?index=equities&from_date=&to_date=', {
        headers: { Cookie: cookies, Referer: 'https://www.nseindia.com' },
      });

      const data = resp.data;
      const announcements = Array.isArray(data) ? data : [];
      for (const ann of announcements.slice(0, max)) {
        articles.push({
          title: `${ann.symbol || 'NSE'}: ${ann.desc || ann.subject || 'Corporate Announcement'}`,
          description: ann.desc || ann.subject || '',
          content: ann.desc || ann.subject || '',
          source: 'NSE India',
          url: ann.attchmntFile ? `https://www.nseindia.com${ann.attchmntFile}` : 'https://www.nseindia.com',
          published_at: ann.an_dt ? new Date(ann.an_dt).toISOString() : new Date().toISOString(),
          fetched_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('[News] NSE India error:', e.message);
      // Fallback: try RSS-like approach
      try {
        const resp = await axios.get('https://www.nseindia.com/api/marketStatus', {
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        const markets = resp.data?.marketState || [];
        for (const m of markets) {
          articles.push({
            title: `${m.market || 'Market'} Status: ${m.marketStatus || 'Unknown'}`,
            description: `${m.market} - ${m.marketStatusMessage || m.marketStatus || ''}. Trade date: ${m.tradeDate || ''}`,
            content: '', source: 'NSE India', url: 'https://www.nseindia.com',
            published_at: new Date().toISOString(), fetched_at: new Date().toISOString(),
          });
        }
      } catch (_) {}
    }
    return articles.slice(0, max);
  }

  // --- Business Today ---
  async function fetchFromBusinessToday(max) {
    const articles = [];
    const marketKeywords = ['market', 'nifty', 'sensex', 'stock', 'share', 'trade', 'rbi', 'bank',
      'invest', 'rupee', 'gdp', 'inflation', 'earnings', 'ipo', 'fund', 'economy',
      'fiscal', 'budget', 'profit', 'revenue', 'sector', 'fii', 'dii', 'fpi',
      'mutual fund', 'bond', 'yield', 'interest rate', 'crude', 'gold', 'silver'];
    try {
      const resp = await axios.get('https://www.businesstoday.in/rss', {
        timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const xml = resp.data;
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items.slice(0, max * 2)) {
        const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '').trim();
        const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || '').replace(/<[^>]+>/g, '').trim();
        const link = (item.match(/<link>(.*?)<\/link>/)?.[1] || '').trim();
        const pub = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
        if (!title) continue;
        const textLower = (title + ' ' + desc).toLowerCase();
        if (marketKeywords.some(kw => textLower.includes(kw))) {
          articles.push({
            title, description: desc, content: desc,
            source: 'Business Today', url: link,
            published_at: pub ? new Date(pub).toISOString() : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.error('[News] Business Today error:', e.message);
    }
    return articles.slice(0, max);
  }

  // --- Hindu Business Line ---
  async function fetchFromHinduBusinessLine(max) {
    const articles = [];
    const feeds = [
      'https://www.thehindubusinessline.com/markets/feeder/default.rss',
      'https://www.thehindubusinessline.com/markets/stock-markets/feeder/default.rss',
      'https://www.thehindubusinessline.com/economy/feeder/default.rss',
    ];
    for (const feedUrl of feeds) {
      try {
        const resp = await axios.get(feedUrl, {
          timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        const xml = resp.data;
        const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
        for (const item of items.slice(0, Math.ceil(max / feeds.length))) {
          const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '').trim();
          const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || '').replace(/<[^>]+>/g, '').trim();
          const link = (item.match(/<link>(.*?)<\/link>/)?.[1] || '').trim();
          const pub = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
          if (!title) continue;
          articles.push({
            title, description: desc, content: desc,
            source: 'Hindu Business Line', url: link,
            published_at: pub ? new Date(pub).toISOString() : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.error(`[News] Hindu BL error (${feedUrl}):`, e.message);
      }
    }
    return articles.slice(0, max);
  }


  // --- NDTV Profit ---
  async function fetchFromNDTVProfit(max) {
    const articles = [];
    const marketKeywords = ['market', 'nifty', 'sensex', 'stock', 'share', 'trade', 'rbi', 'bank',
      'invest', 'rupee', 'gdp', 'inflation', 'earnings', 'ipo', 'fund', 'economy', 'fiscal', 'budget', 'profit', 'revenue', 'sector', 'fii', 'dii'];
    try {
      const resp = await axios.get('https://feeds.feedburner.com/ndtvprofit-latest', {
        timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const xml = resp.data;
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items.slice(0, max * 2)) {
        const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '').trim();
        const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || '').replace(/<[^>]+>/g, '').trim();
        const link = (item.match(/<link>(.*?)<\/link>/)?.[1] || '').trim();
        const pub = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
        if (!title) continue;
        const textLower = (title + ' ' + desc).toLowerCase();
        if (marketKeywords.some(kw => textLower.includes(kw))) {
          articles.push({
            title, description: desc, content: desc,
            source: 'NDTV Profit', url: link,
            published_at: pub ? new Date(pub).toISOString() : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.error('[News] NDTV Profit error:', e.message);
    }
    return articles.slice(0, max);
  }

  // --- CNBC TV18 ---
  async function fetchFromCNBCTV18(max) {
    const articles = [];
    const feeds = [
      'https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml',
      'https://www.cnbctv18.com/commonfeeds/v1/cne/rss/economy.xml',
    ];
    for (const feedUrl of feeds) {
      try {
        const resp = await axios.get(feedUrl, {
          timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        const xml = resp.data;
        const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
        for (const item of items.slice(0, Math.ceil(max / feeds.length))) {
          const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '').trim();
          const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || '').replace(/<[^>]+>/g, '').trim();
          const link = (item.match(/<link>(.*?)<\/link>/)?.[1] || '').trim();
          const pub = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
          if (!title) continue;
          articles.push({
            title, description: desc, content: desc,
            source: 'CNBC TV18', url: link,
            published_at: pub ? new Date(pub).toISOString() : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.error(`[News] CNBC TV18 error (${feedUrl}):`, e.message);
      }
    }
    return articles.slice(0, max);
  }

  // --- Livemint ---
  async function fetchFromLivemint(max) {
    const articles = [];
    try {
      const resp = await axios.get('https://www.livemint.com/rss/markets', {
        timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const xml = resp.data;
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items.slice(0, max)) {
        const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '').trim();
        const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || '').replace(/<[^>]+>/g, '').trim();
        const link = (item.match(/<link>(.*?)<\/link>/)?.[1] || '').trim();
        const pub = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
        if (!title) continue;
        articles.push({
          title, description: desc, content: desc,
          source: 'Livemint', url: link,
          published_at: pub ? new Date(pub).toISOString() : new Date().toISOString(),
          fetched_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('[News] Livemint error:', e.message);
    }
    return articles.slice(0, max);
  }

  // --- NewsAPI ---
  function fetchFromNewsAPI(apiKey, max) {
    return axios.get('https://newsapi.org/v2/everything', {
      params: { q: 'stock market OR nifty OR sensex OR options trading OR india market', language: 'en', sortBy: 'publishedAt', pageSize: max, apiKey },
      timeout: 10000,
    }).then(resp => {
      if (resp.data?.status !== 'ok') throw new Error(resp.data?.message || 'NewsAPI error');
      return (resp.data.articles || []).map(a => ({
        title: a.title || '', description: a.description || '', content: a.content || '',
        source: a.source?.name || 'NewsAPI', url: a.url || '', published_at: a.publishedAt || '',
        fetched_at: new Date().toISOString(),
      }));
    });
  }

  // --- Alpha Vantage ---
  function fetchFromAlphaVantage(apiKey, max) {
    return axios.get('https://www.alphavantage.co/query', {
      params: { function: 'NEWS_SENTIMENT', tickers: 'NSE:NIFTY,NSE:BANKNIFTY', topics: 'financial_markets,economy_macro', limit: max, apikey: apiKey },
      timeout: 15000,
    }).then(resp => {
      const data = resp.data;
      if (data['Error Message'] || data['Note']) throw new Error(data['Error Message'] || data['Note']);
      return (data.feed || []).map(item => ({
        title: item.title || '', description: item.summary || '', content: item.summary || '',
        source: item.source || 'Alpha Vantage', url: item.url || '',
        published_at: item.time_published || '', fetched_at: new Date().toISOString(),
      }));
    });
  }

  // --- Demo News ---
  function getDemoNews() {
    const now = new Date();
    return [
      { title: 'Nifty 50 rallies 2% as global markets surge on positive economic data', description: 'Indian benchmark index Nifty 50 closed at fresh highs today, driven by strong FII inflows and positive global cues. Banking and IT stocks led the rally.', content: 'Market experts suggest bullish trend may continue', source: 'Demo Market News', url: '#', published_at: new Date(now - 10 * 60000).toISOString(), fetched_at: now.toISOString() },
      { title: 'RBI maintains repo rate, signals cautious stance on inflation', description: 'Reserve Bank of India kept interest rates unchanged in its latest policy meeting, citing concerns over persistent inflation despite growth moderation.', content: 'Markets react mixed to RBI decision', source: 'Demo Financial Times', url: '#', published_at: new Date(now - 30 * 60000).toISOString(), fetched_at: now.toISOString() },
      { title: 'Tech stocks under pressure as valuations questioned by analysts', description: 'Major IT companies face selling pressure as analysts raise concerns about high valuations amid global tech slowdown.', content: 'Investors advised caution', source: 'Demo Business Wire', url: '#', published_at: new Date(now - 60 * 60000).toISOString(), fetched_at: now.toISOString() },
      { title: 'Strong Q4 earnings boost sentiment in banking sector', description: 'Major banks report better-than-expected quarterly results, leading to renewed investor interest in financial stocks.', content: 'Banking index outperforms', source: 'Demo Market Watch', url: '#', published_at: new Date(now - 120 * 60000).toISOString(), fetched_at: now.toISOString() },
      { title: 'Global crude oil prices fall 3%, benefiting import-dependent India', description: 'International oil prices declined sharply on demand concerns, providing relief to Indian markets.', content: 'Energy stocks react', source: 'Demo Energy News', url: '#', published_at: new Date(now - 180 * 60000).toISOString(), fetched_at: now.toISOString() },
    ];
  }

  // ============ Routes ============

  // GET /api/news/fetch
  router.get('/api/news/fetch', async (req, res) => {
    try {
      const newsCfg = db.data.settings?.news || { sources: ['demo'] };
      const sources = newsCfg.sources || ['demo'];
      let allNews = [];
      const errors = [];

      // Fetch from all selected sources
      for (const src of sources) {
        try {
          if (src === 'moneycontrol') {
            allNews = allNews.concat(await fetchFromMoneycontrol(10));
          } else if (src === 'economictimes') {
            allNews = allNews.concat(await fetchFromEconomicTimes(10));
          } else if (src === 'nse_india') {
            allNews = allNews.concat(await fetchFromNSEIndia(8));
          } else if (src === 'newsapi') {
            const key = newsCfg.newsapi_key || '';
            if (key && key !== 'get_from_newsapi_org') allNews = allNews.concat(await fetchFromNewsAPI(key, 10));
          } else if (src === 'alphavantage') {
            const key = newsCfg.alphavantage_key || '';
            if (key && key !== 'get_from_alphavantage_co') allNews = allNews.concat(await fetchFromAlphaVantage(key, 10));
          } else if (src === 'businesstoday') {
            allNews = allNews.concat(await fetchFromBusinessToday(10));
          } else if (src === 'hindubusinessline') {
            allNews = allNews.concat(await fetchFromHinduBusinessLine(10));
          } else if (src === 'ndtv_profit') {
            allNews = allNews.concat(await fetchFromNDTVProfit(10));
          } else if (src === 'cnbc_tv18') {
            allNews = allNews.concat(await fetchFromCNBCTV18(10));
          } else if (src === 'livemint') {
            allNews = allNews.concat(await fetchFromLivemint(10));
          }
        } catch (e) {
          console.error(`[News] ${src} error:`, e.message);
          errors.push({ source: src, error: e.message });
        }
      }

      // Fallback to demo if nothing fetched
      if (allNews.length === 0) {
        allNews = getDemoNews();
      }

      // Deduplicate articles by normalized title
      const seenTitles = new Set();
      const existingTitles = new Set((db.data.news_articles || []).slice(-100).map(n => (n.title || '').toLowerCase().trim()));
      allNews = allNews.filter(a => {
        const norm = (a.title || '').toLowerCase().trim();
        if (!norm || seenTitles.has(norm) || existingTitles.has(norm)) return false;
        seenTitles.add(norm);
        return true;
      });

      allNews = allNews.slice(0, 15);

      if (!db.data.news_articles) db.data.news_articles = [];
      if (!db.data.signals) db.data.signals = [];

      const processed = [];
      for (const article of allNews) {
        const articleId = uuid();
        const sentiment = await analyzeSentiment(article);

        const newsDoc = {
          id: articleId, title: article.title, description: article.description,
          content: article.content || '', source: article.source, url: article.url,
          published_at: article.published_at, sentiment_analysis: sentiment,
          created_at: new Date().toISOString(),
        };
        db.data.news_articles.push(newsDoc);

        let signalGenerated = false;
        if (sentiment.confidence >= 60 && sentiment.trading_signal !== 'HOLD') {
          const signal = generateSignal(newsDoc);
          if (signal) {
            db.data.signals.push(signal);

            // Notify: New Signal
            if (db.notify) db.notify('signal', `${signal.signal_type} Signal`, `${signal.symbol} | ${sentiment.sentiment} ${sentiment.confidence}% | ${sentiment.reason}`);

            // LIVE mode → place real Upstox order, PAPER mode → paper trade
            const mode = db.data.settings?.trading_mode || 'PAPER';
            const activeBroker = db.data.settings?.active_broker || db.data.settings?.broker?.name || 'upstox';
            const token = db.data.settings?.broker?.[`${activeBroker}_token`] || db.data.settings?.broker?.access_token;

            if (mode === 'LIVE' && token) {
              console.log(`[AutoTrade] LIVE mode, executing trade for ${signal.symbol} ${signal.signal_type}`);
              const result = await executeLiveTrade(signal, token);
              if (db.notify) db.notify('entry', `LIVE ${signal.signal_type} Entry`, `${signal.symbol} | Qty: ${signal.quantity} | ${result.success ? 'Order ID: ' + result.order_id : 'FAILED: ' + (result.error || '')}`);
            } else {
              executePaperTrade(signal);
              if (db.notify) db.notify('entry', `Paper ${signal.signal_type} Entry`, `${signal.symbol} | Qty: ${signal.quantity} | Investment: ${signal.investment_amount}`);
            }
            signalGenerated = true;
          }
        }

        processed.push({
          id: articleId, title: article.title, description: article.description,
          source: article.source, url: article.url, published_at: article.published_at,
          sentiment_analysis: sentiment, created_at: newsDoc.created_at,
          signal_generated: signalGenerated,
        });
      }

      db.save();
      res.json({ status: 'success', articles_processed: processed.length, articles: processed, errors });
    } catch (err) {
      console.error('[News] Fetch error:', err);
      res.json({ status: 'error', message: err.message, articles: [], errors: [{ source: 'system', error: err.message }] });
    }
  });

  // GET /api/news/latest
  router.get('/api/news/latest', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const news = (db.data.news_articles || [])
      .slice()
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, limit);
    res.json({ status: 'success', count: news.length, news });
  });

  // GET /api/ai/insights - AI Decision Engine Dashboard Data
  router.get('/api/ai/insights', (req, res) => {
    const insights = aiEngine.getAIInsights();

    // Add market status
    const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
    const weekday = ist.getUTCDay();
    const h = ist.getUTCHours();
    const m = ist.getUTCMinutes();
    const totalMin = h * 60 + m;
    const marketOpen = weekday >= 1 && weekday <= 5 && totalMin >= 555 && totalMin < 930;
    insights.market_status = {
      is_open: marketOpen,
      message: marketOpen ? 'Market Open' : 'Market Closed',
    };

    // Filter performance by current trading mode
    const currentMode = db.data.settings?.trading_mode || 'PAPER';
    const signals = (db.data.signals || []).filter(s => (s.mode || 'PAPER') === currentMode).slice(-20);
    const trades = (db.data.trades || []).filter(t => t.status === 'CLOSED' && (t.mode || 'PAPER') === currentMode).slice(-20);
    const winRate = trades.length > 0 ? Math.round((trades.filter(t => t.pnl > 0).length / trades.length) * 100) : 0;
    const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);

    insights.performance = {
      recent_signals: signals.length,
      closed_trades: trades.length,
      win_rate: winRate,
      total_pnl: Math.round(totalPnl * 100) / 100,
      avg_confidence: signals.length > 0 ? Math.round(signals.reduce((s, sig) => s + (sig.confidence || 0), 0) / signals.length) : 0,
      mode: currentMode,
    };

    res.json({ status: 'success', insights });
  });

  // POST /api/ai/trade-review - Generate AI review for a completed trade
  router.post('/api/ai/trade-review', async (req, res) => {
    const { trade_id } = req.body;
    const trade = (db.data.trades || []).find(t => t.id === trade_id);
    if (!trade) return res.json({ status: 'error', message: 'Trade not found' });
    if (trade.status !== 'CLOSED') return res.json({ status: 'error', message: 'Trade still open' });

    const aiKey = db.data.settings?.ai?.emergent_llm_key || '';
    const review = await aiEngine.generateTradeReview(trade, OpenAI, aiKey);

    if (review) {
      // Store review on the trade
      trade.ai_review = review;
      trade.reviewed_at = new Date().toISOString();
      db.save();

      // Update historical patterns
      if (!db.data.historical_patterns) db.data.historical_patterns = [];
      db.data.historical_patterns.push({
        sector: trade.sector || 'BROAD_MARKET',
        sentiment: trade.sentiment || 'NEUTRAL',
        was_profitable: trade.pnl > 0,
        pnl: trade.pnl,
        pnl_pct: trade.pnl_percentage,
        trade_type: trade.trade_type,
        date: new Date().toISOString(),
      });
      db.save();
    }

    res.json({ status: 'success', review: review || 'AI review unavailable (no API key)' });
  });

  // GET /api/ai/heatmap - Sector-wise confidence heatmap for last 24 hours
  router.get('/api/ai/heatmap', (req, res) => {
    const sectors = ['BANKING', 'IT', 'PHARMA', 'AUTO', 'ENERGY', 'METAL', 'FMCG', 'INFRA', 'REALTY', 'BROAD_MARKET'];
    const timeBuckets = ['0-4h', '4-8h', '8-12h', '12-16h', '16-20h', '20-24h'];
    const now = Date.now();
    const cutoff = now - 86400000;

    const heatmap = {};
    const sectorSummary = {};
    for (const s of sectors) {
      heatmap[s] = {};
      sectorSummary[s] = { bullish: 0, bearish: 0, neutral: 0, total: 0, avg_confidence: 0, confs: [] };
      for (const b of timeBuckets) {
        heatmap[s][b] = { bullish: 0, bearish: 0, neutral: 0, total: 0, avg_confidence: 0, confs: [] };
      }
    }

    function getBucket(createdAt) {
      const t = new Date(createdAt).getTime();
      const hoursAgo = (now - t) / 3600000;
      if (hoursAgo < 4) return '0-4h';
      if (hoursAgo < 8) return '4-8h';
      if (hoursAgo < 12) return '8-12h';
      if (hoursAgo < 16) return '12-16h';
      if (hoursAgo < 20) return '16-20h';
      return '20-24h';
    }

    function addEntry(sector, sentiment, confidence, createdAt) {
      if (!sectors.includes(sector)) sector = 'BROAD_MARKET';
      const bucket = getBucket(createdAt);
      const cell = heatmap[sector][bucket];
      cell.total++;
      cell.confs.push(confidence);
      if (sentiment === 'BULLISH') cell.bullish++;
      else if (sentiment === 'BEARISH') cell.bearish++;
      else cell.neutral++;

      const ss = sectorSummary[sector];
      ss.total++;
      ss.confs.push(confidence);
      if (sentiment === 'BULLISH') ss.bullish++;
      else if (sentiment === 'BEARISH') ss.bearish++;
      else ss.neutral++;
    }

    // Process articles
    for (const art of (db.data.news_articles || [])) {
      if (new Date(art.created_at).getTime() < cutoff) continue;
      const sa = art.sentiment_analysis || {};
      addEntry(sa.sector || 'BROAD_MARKET', sa.sentiment || 'NEUTRAL', sa.confidence || 50, art.created_at);
    }

    // Process signals
    for (const sig of (db.data.signals || [])) {
      if (new Date(sig.created_at).getTime() < cutoff) continue;
      addEntry(sig.sector || 'BROAD_MARKET', sig.sentiment || 'NEUTRAL', sig.composite_score || sig.confidence || 50, sig.created_at);
    }

    // Compute averages
    for (const s of sectors) {
      for (const b of timeBuckets) {
        const c = heatmap[s][b];
        if (c.confs.length) c.avg_confidence = Math.round(c.confs.reduce((a, b) => a + b, 0) / c.confs.length);
        delete c.confs;
      }
      const ss = sectorSummary[s];
      if (ss.confs.length) ss.avg_confidence = Math.round(ss.confs.reduce((a, b) => a + b, 0) / ss.confs.length);
      delete ss.confs;
    }

    const activeSectors = Object.fromEntries(Object.entries(sectorSummary).filter(([_, v]) => v.total > 0));
    res.json({ status: 'success', heatmap, sector_summary: sectorSummary, active_sectors: activeSectors, time_buckets: timeBuckets, sectors });
  });



  // ============ Signal & Trade Generation Helpers ============
  function generateSignal(newsDoc) {
    const sentiment = newsDoc.sentiment_analysis || {};
    const signalType = sentiment.trading_signal === 'BUY_CALL' ? 'CALL' : 'PUT';
    const portfolio = db.data.portfolio || {};
    const available = portfolio.available_capital || 500000;

    const riskCfg = db.data.settings?.risk || {};
    const tolerance = riskCfg.risk_tolerance || 'medium';
    const riskParams = { low: { stop_loss_pct: 15, target_pct: 30, max_position_size: 0.03 }, medium: { stop_loss_pct: 25, target_pct: 50, max_position_size: 0.05 }, high: { stop_loss_pct: 35, target_pct: 70, max_position_size: 0.07 } };
    const rp = riskParams[tolerance] || riskParams.medium;
    const maxTrade = riskCfg.max_per_trade || 20000;
    const dailyLimit = riskCfg.daily_limit || 100000;

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayTrades = (db.data.trades || []).filter(t => t.entry_time >= todayStart.toISOString());
    const todayValue = todayTrades.reduce((s, t) => s + (t.investment || 0), 0);
    if (todayValue >= dailyLimit) return null;

    // Historical pattern adjustment
    const historicalAdj = getHistoricalAdjustment(sentiment.sector || 'BROAD_MARKET', sentiment.sentiment);

    // Use composite score instead of raw confidence
    const adjustedConfidence = sentiment.composite_score || Math.max(30, Math.min(98, (sentiment.confidence || 50) + historicalAdj));
    if (adjustedConfidence < 55) return null;

    // Market hours check
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    const istDay = ist.getUTCDay();
    const istMins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    if (istDay === 0 || istDay === 6 || istMins < 555 || istMins > 930) {
      console.log('[Signal] Market closed, skipping signal generation');
      return null;
    }

    // Dynamic position sizing via AI engine
    const basePositionSize = Math.min(maxTrade, available * rp.max_position_size, dailyLimit - todayValue);
    if (basePositionSize < 1000) return null;

    const dynamicSize = aiEngine.calculateDynamicPositionSize(
      basePositionSize,
      adjustedConfidence,
      sentiment.sector || 'BROAD_MARKET'
    );

    const positionSize = Math.min(dynamicSize.size, basePositionSize); // Never exceed base limits
    if (positionSize < 1000) return null;

    const optionPremium = 150;
    const quantity = Math.floor(positionSize / optionPremium);
    if (quantity === 0) return null;

    // AI-enhanced reason with all scoring details
    let enhancedReason = sentiment.reason || '';
    if (sentiment.correlation_score) enhancedReason += ` | Correlation: ${sentiment.correlation_score}%`;
    if (sentiment.confluence_score) enhancedReason += ` | Confluence: ${sentiment.confluence_score}%`;
    if (sentiment.market_regime && sentiment.market_regime !== 'UNKNOWN') enhancedReason += ` | Regime: ${sentiment.market_regime}`;
    if (historicalAdj !== 0) enhancedReason += ` | Historical: ${historicalAdj > 0 ? '+' : ''}${historicalAdj}`;

    const activeInst = db.data?.settings?.trading_instrument || db.data?.settings?.active_instrument || 'NIFTY50';
    
    // Get actual spot price from latest market data or use instrument default
    const instConfig = INSTRUMENTS[activeInst] || INSTRUMENTS.NIFTY50;
    let spotPrice = instConfig.base_price || 24000;
    // Try to get real spot price from stored market data
    if (db.data.market_data?.indices) {
      const key = activeInst.toLowerCase();
      const idx = db.data.market_data.indices[key];
      if (idx?.value > 0) spotPrice = idx.value;
    }
    const strikeStep = instConfig.strike_step || 50;
    const atmStrike = Math.round(spotPrice / strikeStep) * strikeStep;
    const strikeOffset = signalType === 'CALL' ? strikeStep * 2 : -(strikeStep * 2);

    return {
      id: uuid(), signal_type: signalType, symbol: activeInst,
      strike_price: atmStrike + strikeOffset,
      option_premium: optionPremium, quantity, investment_amount: quantity * optionPremium,
      entry_price: optionPremium,
      stop_loss: Math.round(optionPremium * (1 - rp.stop_loss_pct / 100) * 100) / 100,
      target: Math.round(optionPremium * (1 + rp.target_pct / 100) * 100) / 100,
      confidence: adjustedConfidence,
      composite_score: sentiment.composite_score || adjustedConfidence,
      correlation_score: sentiment.correlation_score || 0,
      confluence_score: sentiment.confluence_score || 0,
      market_regime: sentiment.market_regime || 'UNKNOWN',
      sentiment: sentiment.sentiment,
      sector: sentiment.sector || 'BROAD_MARKET',
      secondary_sector: sentiment.secondary_sector || 'NONE',
      volatility: sentiment.volatility || 'STABLE',
      time_horizon: sentiment.time_horizon || 'SHORT_TERM',
      risk_level: sentiment.risk_level || 'MEDIUM',
      freshness_score: sentiment.freshness_score || 50,
      position_sizing: dynamicSize.factors,
      reason: enhancedReason,
      news_id: newsDoc.id, status: 'ACTIVE',
      mode: db.data?.settings?.trading_mode || 'PAPER',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
  }

  function executePaperTrade(signal) {
    if (!db.data.trades) db.data.trades = [];
    const trade = {
      id: uuid(), signal_id: signal.id, trade_type: signal.signal_type,
      symbol: signal.symbol, entry_time: new Date().toISOString(),
      entry_price: signal.entry_price, quantity: signal.quantity,
      investment: signal.investment_amount, stop_loss: signal.stop_loss,
      target: signal.target, status: 'OPEN',
      mode: db.data?.settings?.trading_mode || 'PAPER',
      exit_time: null, exit_price: null, pnl: 0, pnl_percentage: 0,
    };
    db.data.trades.push(trade);

    const p = db.data.portfolio;
    if (p) {
      p.invested_amount = (p.invested_amount || 0) + signal.investment_amount;
      p.available_capital = (p.available_capital || 0) - signal.investment_amount;
      if (!p.active_positions) p.active_positions = [];
      p.active_positions.push(trade.id);
      p.last_updated = new Date().toISOString();
    }
    db.save();
  }

  // ============ LIVE Trade via Upstox ============
  async function executeLiveTrade(signal, accessToken) {
    const headers = { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0', 'Content-Type': 'application/json' };

    try {
      // Step 1: Find the nearest weekly expiry option instrument
      const optionType = signal.signal_type === 'CALL' ? 'CE' : 'PE';
      const strikePrice = signal.strike_price;
      const activeInst = signal.symbol || 'NIFTY50';

      // Map instrument to Upstox key
      const instKeyMap = {
        'NIFTY50': 'NSE_INDEX|Nifty 50', 'BANKNIFTY': 'NSE_INDEX|Nifty Bank',
        'FINNIFTY': 'NSE_INDEX|Nifty Fin Service', 'MIDCPNIFTY': 'NSE_INDEX|NIFTY MID SELECT',
        'SENSEX': 'BSE_INDEX|SENSEX', 'BANKEX': 'BSE_INDEX|BANKEX',
      };
      const instKey = instKeyMap[activeInst] || 'NSE_INDEX|Nifty 50';

      // Get nearest valid expiry from Upstox API (or calculated Tuesday fallback)
      let expiryStr = '';
      try {
        const contractResp = await axios.get('https://api.upstox.com/v2/option/contract', {
          headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' },
          params: { instrument_key: instKey },
          timeout: 10000,
        });
        if (contractResp.data?.status === 'success' && contractResp.data?.data?.length > 0) {
          expiryStr = (contractResp.data.data[0].expiry || '').substring(0, 10);
        }
      } catch (e) { console.error(`[LiveTrade] Expiry fetch failed: ${e.message}`); }
      if (!expiryStr) {
        // Fallback: calculate next Tuesday (NSE post-Aug 2025)
        const now = new Date(); const istOffset = 5.5 * 60 * 60 * 1000;
        const ist = new Date(now.getTime() + istOffset);
        let daysToAdd = 2 - ist.getUTCDay(); // Tuesday = 2
        if (daysToAdd < 0) daysToAdd += 7;
        if (daysToAdd === 0 && (ist.getUTCHours() * 60 + ist.getUTCMinutes()) > 930) daysToAdd = 7;
        const expiryDate = new Date(ist.getTime() + daysToAdd * 86400000);
        expiryStr = `${expiryDate.getUTCFullYear()}-${String(expiryDate.getUTCMonth() + 1).padStart(2, '0')}-${String(expiryDate.getUTCDate()).padStart(2, '0')}`;
      }

      console.log(`[LiveTrade] Looking up option chain: ${instKey} expiry=${expiryStr} strike=${strikePrice} ${optionType}`);

      // Search for option instrument in chain
      const searchResp = await axios.get('https://api.upstox.com/v2/option/chain', {
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' },
        params: { instrument_key: instKey, expiry_date: expiryStr },
        timeout: 15000,
      }).catch(err => {
        console.error(`[LiveTrade] Option chain lookup failed: ${err.response?.data?.message || err.message}`);
        return null;
      });

      let instrumentToken = null;

      if (searchResp?.data?.status === 'success' && searchResp.data.data) {
        // Find closest strike price in option chain
        const chain = searchResp.data.data;
        let closest = null;
        let minDiff = Infinity;

        for (const item of chain) {
          const opt = optionType === 'CE' ? item.call_options : item.put_options;
          if (opt?.instrument_key) {
            const diff = Math.abs((item.strike_price || 0) - strikePrice);
            if (diff < minDiff) {
              minDiff = diff;
              closest = opt;
              instrumentToken = opt.instrument_key;
            }
          }
        }
      }

      if (!instrumentToken) {
        // Fallback: construct instrument token using expiry string
        const [eY, eM, eD] = expiryStr.split('-');
        const optSymbolMap = { NIFTY50: 'NIFTY', BANKNIFTY: 'BANKNIFTY', FINNIFTY: 'FINNIFTY', MIDCPNIFTY: 'MIDCPNIFTY', SENSEX: 'SENSEX', BANKEX: 'BANKEX' };
        const exchangeMap = { NIFTY50: 'NSE_FO', BANKNIFTY: 'NSE_FO', FINNIFTY: 'NSE_FO', MIDCPNIFTY: 'NSE_FO', SENSEX: 'BFO', BANKEX: 'BFO' };
        const optSymbol = optSymbolMap[activeInst] || 'NIFTY';
        const exchange = exchangeMap[activeInst] || 'NSE_FO';
        instrumentToken = `${exchange}|${optSymbol}${eY.slice(2)}${eM}${eD}${strikePrice}${optionType}`;
        console.log(`[LiveTrade] Using constructed instrument: ${instrumentToken}`);
      }

      // Step 2: Place MARKET order
      const orderBody = {
        quantity: signal.quantity,
        product: 'D',
        validity: 'DAY',
        price: 0,
        instrument_token: instrumentToken,
        order_type: 'MARKET',
        transaction_type: 'BUY',
        disclosed_quantity: 0,
        trigger_price: 0,
        is_amo: false,
      };

      console.log(`[LiveTrade] Placing ${signal.signal_type} order: ${instrumentToken} qty=${signal.quantity}`);

      const orderResp = await axios.post('https://api.upstox.com/v2/order/place', orderBody, { headers, timeout: 15000 });

      const orderId = orderResp.data?.data?.order_id || '';
      const orderSuccess = orderResp.data?.status === 'success';

      // Step 3: Track trade
      if (!db.data.trades) db.data.trades = [];
      const trade = {
        id: uuid(), signal_id: signal.id, trade_type: signal.signal_type,
        symbol: signal.symbol, entry_time: new Date().toISOString(),
        entry_price: signal.entry_price, quantity: signal.quantity,
        investment: signal.investment_amount, stop_loss: signal.stop_loss,
        target: signal.target, status: orderSuccess ? 'OPEN' : 'FAILED',
        mode: 'LIVE', order_id: orderId, instrument_token: instrumentToken,
        exit_time: null, exit_price: null, pnl: 0, pnl_percentage: 0,
        upstox_status: orderResp.data?.status || 'unknown',
        upstox_message: orderResp.data?.message || '',
      };
      db.data.trades.push(trade);

      // Update portfolio
      if (orderSuccess) {
        const p = db.data.portfolio;
        if (p) {
          p.invested_amount = (p.invested_amount || 0) + signal.investment_amount;
          p.available_capital = (p.available_capital || 0) - signal.investment_amount;
          if (!p.active_positions) p.active_positions = [];
          p.active_positions.push(trade.id);
          p.last_updated = new Date().toISOString();
        }
        console.log(`[LiveTrade] Order placed! ID: ${orderId}`);
      } else {
        console.error(`[LiveTrade] Order failed: ${orderResp.data?.message || 'Unknown error'}`);
      }

      db.save();
      return { success: orderSuccess, order_id: orderId, trade };

    } catch (err) {
      console.error(`[LiveTrade] Error: ${err.message}`);
      // Save failed trade for tracking
      if (!db.data.trades) db.data.trades = [];
      db.data.trades.push({
        id: uuid(), signal_id: signal.id, trade_type: signal.signal_type,
        symbol: signal.symbol, entry_time: new Date().toISOString(),
        entry_price: signal.entry_price, quantity: signal.quantity,
        investment: signal.investment_amount, status: 'FAILED',
        mode: 'LIVE', error: err.message,
        exit_time: null, exit_price: null, pnl: 0, pnl_percentage: 0,
      });
      db.save();
      return { success: false, error: err.message };
    }
  }

  return router;
};
