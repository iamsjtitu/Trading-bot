const { Router } = require('express');
const axios = require('axios');
const crypto = require('crypto');
let OpenAI;
try { OpenAI = require('openai'); } catch (_) { OpenAI = null; }

function uuid() { return crypto.randomUUID(); }

module.exports = function (db) {
  const router = Router();

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

    // Use AI if key available
    if (aiKey && OpenAI) {
      try {
        const client = new OpenAI({ apiKey: aiKey, baseURL: 'https://integrations.emergentagent.com/llm' });

        const systemMsg = `You are an expert Indian stock market analyst with deep knowledge of Nifty 50, Bank Nifty, and sectoral indices. You specialize in options trading sentiment analysis.

Analyze the given news article considering:
1. DIRECT MARKET IMPACT - How will this news move Nifty/BankNifty in the next 1-3 hours?
2. SECTOR IMPACT - Which sector is most affected?
3. FII/DII FLOW IMPACT - Will this attract or repel institutional money?
4. GLOBAL CORRELATION - Is this aligned with global market trends?
5. HISTORICAL PATTERN - Similar news in the past led to what market movement?

Provide analysis in this EXACT format:
SENTIMENT: [BULLISH/BEARISH/NEUTRAL]
CONFIDENCE: [0-100]
IMPACT: [HIGH/MEDIUM/LOW]
SECTOR: [BANKING/IT/PHARMA/AUTO/ENERGY/METAL/FMCG/BROAD_MARKET]
REASON: [Detailed one-line explanation with specific market impact prediction]
TRADING_SIGNAL: [BUY_CALL/BUY_PUT/HOLD]

Confidence Guide:
- 85-100: Clear directional news with strong precedent (rate cuts, major earnings, policy changes)
- 70-84: Strong sentiment with moderate certainty (sector rotation, FII data, global cues)
- 55-69: Mild sentiment, mixed signals
- Below 55: Unclear impact, recommend HOLD

Be conservative - only recommend BUY_CALL/BUY_PUT when confidence >= 65 and impact is MEDIUM or HIGH.`;

        const userMsg = `Title: ${article.title || ''}\nDescription: ${article.description || ''}\nSource: ${article.source || ''}\nPublished: ${article.published_at || ''}`;

        const completion = await client.chat.completions.create({
          model: 'openai/gpt-4.1-mini',
          messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }],
          max_tokens: 400,
        });

        const result = parseSentiment(completion.choices?.[0]?.message?.content || '');

        // Apply trend adjustment
        const trendAdj = getTrendAdjustment(result.sentiment);
        result.confidence = Math.max(30, Math.min(98, result.confidence + trendAdj));
        if (trendAdj !== 0) result.trend_note = `Confidence adjusted by ${trendAdj > 0 ? '+' : ''}${trendAdj} based on recent trend`;

        // Detect sector if AI didn't provide
        if (!result.sector) {
          result.sector = detectSector(`${article.title || ''} ${article.description || ''}`);
        }

        recentSentiments.push(result);
        if (recentSentiments.length > 20) recentSentiments.splice(0, recentSentiments.length - 20);
        return result;
      } catch (err) {
        console.error('[Sentiment] AI error, falling back to keywords:', err.message);
      }
    }

    // Fallback: keyword-based analysis
    const result = keywordSentiment(article);
    recentSentiments.push(result);
    if (recentSentiments.length > 20) recentSentiments.splice(0, recentSentiments.length - 20);
    return result;
  }

  function parseSentiment(text) {
    const result = { sentiment: 'NEUTRAL', confidence: 50, impact: 'LOW', sector: 'BROAD_MARKET', reason: '', trading_signal: 'HOLD' };
    for (const line of text.split('\n')) {
      const l = line.trim();
      if (l.startsWith('SENTIMENT:')) result.sentiment = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('CONFIDENCE:')) result.confidence = parseInt(l.split(':').slice(1).join(':').trim()) || 50;
      else if (l.startsWith('IMPACT:')) result.impact = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('SECTOR:')) result.sector = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('REASON:')) result.reason = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('TRADING_SIGNAL:')) result.trading_signal = l.split(':').slice(1).join(':').trim();
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
            const token = db.data.settings?.broker?.access_token;

            if (mode === 'LIVE' && token) {
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

    // Historical pattern adjustment - check if this sentiment+sector combo has been profitable
    let confidenceAdj = 0;
    const patterns = db.data.historical_patterns || [];
    const sectorPatterns = patterns.filter(p => p.sector === (sentiment.sector || 'BROAD_MARKET') && p.sentiment === sentiment.sentiment);
    if (sectorPatterns.length >= 3) {
      const winRate = sectorPatterns.filter(p => p.was_profitable).length / sectorPatterns.length;
      if (winRate >= 0.7) confidenceAdj = 5;
      else if (winRate <= 0.3) confidenceAdj = -8;
    }
    const adjustedConfidence = Math.max(30, Math.min(98, (sentiment.confidence || 50) + confidenceAdj));
    if (adjustedConfidence < 55) return null;

    // Check market hours - don't generate signals when market is closed
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    const istDay = ist.getUTCDay();
    const istMins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    if (istDay === 0 || istDay === 6 || istMins < 555 || istMins > 930) {
      console.log('[Signal] Market closed, skipping signal generation');
      return null;
    }

    const positionSize = Math.min(maxTrade, available * rp.max_position_size, dailyLimit - todayValue);
    if (positionSize < 1000) return null;

    const optionPremium = 150;
    const quantity = Math.floor(positionSize / optionPremium);
    if (quantity === 0) return null;

    return {
      id: uuid(), signal_type: signalType, symbol: 'NIFTY50',
      strike_price: 24000 + (signalType === 'CALL' ? 500 : -500),
      option_premium: optionPremium, quantity, investment_amount: quantity * optionPremium,
      entry_price: optionPremium,
      stop_loss: Math.round(optionPremium * (1 - rp.stop_loss_pct / 100) * 100) / 100,
      target: Math.round(optionPremium * (1 + rp.target_pct / 100) * 100) / 100,
      confidence: adjustedConfidence, sentiment: sentiment.sentiment,
      sector: sentiment.sector || 'BROAD_MARKET',
      reason: sentiment.reason + (confidenceAdj ? ` [Historical adj: ${confidenceAdj > 0 ? '+' : ''}${confidenceAdj}]` : ''),
      news_id: newsDoc.id, status: 'ACTIVE',
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

      // Search for NIFTY option instrument
      const searchResp = await axios.get(`https://api.upstox.com/v2/option/chain?instrument_key=NSE_INDEX|Nifty 50&expiry_date=`, {
        headers, timeout: 15000,
      }).catch(() => null);

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
        // Fallback: construct instrument token manually
        const now = new Date();
        const year = String(now.getFullYear()).slice(2);
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        instrumentToken = `NSE_FO|NIFTY${year}${month}${day}${strikePrice}${optionType}`;
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
