const { Router } = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');

module.exports = function (db) {
  const router = Router();

  // ============ Sentiment Analysis ============
  async function analyzeSentiment(article) {
    const aiKey = db.data.settings?.ai?.emergent_llm_key || '';
    if (!aiKey) {
      return { sentiment: 'NEUTRAL', confidence: 50, impact: 'LOW', reason: 'No AI key configured', trading_signal: 'HOLD' };
    }

    try {
      const client = new OpenAI({
        apiKey: aiKey,
        baseURL: 'https://integrations.emergentagent.com/llm',
      });

      const systemMsg = `You are a professional financial market analyst specializing in sentiment analysis for options trading.

Your task is to analyze news articles and determine their impact on the Indian stock market (Nifty 50, Bank Nifty).

Provide your analysis in this EXACT format:
SENTIMENT: [BULLISH/BEARISH/NEUTRAL]
CONFIDENCE: [0-100]
IMPACT: [HIGH/MEDIUM/LOW]
REASON: [One line explanation]
TRADING_SIGNAL: [BUY_CALL/BUY_PUT/HOLD]

Rules:
- BULLISH = positive news that will push market up
- BEARISH = negative news that will push market down
- NEUTRAL = no clear direction
- CONFIDENCE: 80-100 (very confident), 60-79 (confident), 40-59 (moderate), <40 (uncertain)
- Consider Indian market context`;

      const userMsg = `Title: ${article.title || ''}\n\nDescription: ${article.description || ''}\n\nContent: ${article.content || ''}\n\nSource: ${article.source || ''}`;

      const completion = await client.chat.completions.create({
        model: 'openai/gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userMsg },
        ],
        max_tokens: 300,
      });

      const text = completion.choices?.[0]?.message?.content || '';
      return parseSentiment(text);
    } catch (err) {
      console.error('[Sentiment] AI error:', err.message);
      return { sentiment: 'NEUTRAL', confidence: 50, impact: 'LOW', reason: 'AI analysis error', trading_signal: 'HOLD' };
    }
  }

  function parseSentiment(text) {
    const result = { sentiment: 'NEUTRAL', confidence: 50, impact: 'LOW', reason: '', trading_signal: 'HOLD' };
    for (const line of text.split('\n')) {
      const l = line.trim();
      if (l.startsWith('SENTIMENT:')) result.sentiment = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('CONFIDENCE:')) result.confidence = parseInt(l.split(':').slice(1).join(':').trim()) || 50;
      else if (l.startsWith('IMPACT:')) result.impact = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('REASON:')) result.reason = l.split(':').slice(1).join(':').trim();
      else if (l.startsWith('TRADING_SIGNAL:')) result.trading_signal = l.split(':').slice(1).join(':').trim();
    }
    return result;
  }

  // ============ News Sources ============
  function fetchFromNewsAPI(apiKey, max) {
    const url = 'https://newsapi.org/v2/everything';
    return axios.get(url, {
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

  function fetchFromAlphaVantage(apiKey, max) {
    return axios.get('https://www.alphavantage.co/query', {
      params: { function: 'NEWS_SENTIMENT', tickers: 'NSE:NIFTY,NSE:BANKNIFTY', topics: 'financial_markets,economy_macro', limit: max, apikey: apiKey },
      timeout: 15000,
    }).then(resp => {
      const data = resp.data;
      if (data['Error Message'] || data['Note']) throw new Error(data['Error Message'] || data['Note']);
      return (data.feed || []).map(item => {
        let pubTime = item.time_published || '';
        if (pubTime && /^\d{8}T\d{6}$/.test(pubTime)) {
          pubTime = `${pubTime.slice(0,4)}-${pubTime.slice(4,6)}-${pubTime.slice(6,8)}T${pubTime.slice(9,11)}:${pubTime.slice(11,13)}:${pubTime.slice(13,15)}Z`;
        }
        return {
          title: item.title || '', description: item.summary || '', content: item.summary || '',
          source: item.source || 'Alpha Vantage', url: item.url || '', published_at: pubTime,
          fetched_at: new Date().toISOString(),
        };
      });
    });
  }

  function getDemoNews() {
    const now = new Date();
    return [
      { title: 'Nifty 50 rallies 2% as global markets surge on positive economic data', description: 'Indian benchmark index Nifty 50 closed at fresh highs today, driven by strong FII inflows and positive global cues. Banking and IT stocks led the rally.', content: 'Market experts suggest bullish trend may continue', source: 'Demo Market News', url: 'https://demo.com/news1', published_at: new Date(now - 10 * 60000).toISOString(), fetched_at: now.toISOString() },
      { title: 'RBI maintains repo rate, signals cautious stance on inflation', description: 'Reserve Bank of India kept interest rates unchanged in its latest policy meeting, citing concerns over persistent inflation despite growth moderation.', content: 'Markets react mixed to RBI decision', source: 'Demo Financial Times', url: 'https://demo.com/news2', published_at: new Date(now - 30 * 60000).toISOString(), fetched_at: now.toISOString() },
      { title: 'Tech stocks under pressure as valuations questioned by analysts', description: 'Major IT companies face selling pressure as analysts raise concerns about high valuations amid global tech slowdown.', content: 'Investors advised caution in tech sector', source: 'Demo Business Wire', url: 'https://demo.com/news3', published_at: new Date(now - 60 * 60000).toISOString(), fetched_at: now.toISOString() },
      { title: 'Strong Q4 earnings boost sentiment in banking sector', description: 'Major banks report better-than-expected quarterly results, leading to renewed investor interest in financial stocks.', content: 'Banking index outperforms broader market', source: 'Demo Market Watch', url: 'https://demo.com/news4', published_at: new Date(now - 120 * 60000).toISOString(), fetched_at: now.toISOString() },
      { title: 'Global crude oil prices fall 3%, benefiting import-dependent India', description: 'International oil prices declined sharply on demand concerns, providing relief to Indian markets and reducing import costs.', content: 'Energy stocks react to oil price movement', source: 'Demo Energy News', url: 'https://demo.com/news5', published_at: new Date(now - 180 * 60000).toISOString(), fetched_at: now.toISOString() },
    ];
  }

  // ============ Routes ============

  // GET /api/news/fetch
  router.get('/api/news/fetch', async (req, res) => {
    try {
      const newsCfg = db.data.settings?.news || { sources: ['demo'] };
      const sources = newsCfg.sources || ['demo'];
      let allNews = [];

      if (sources.includes('newsapi')) {
        const key = newsCfg.newsapi_key || '';
        if (key && key !== 'get_from_newsapi_org') {
          try { allNews = allNews.concat(await fetchFromNewsAPI(key, 10)); } catch (e) { console.error('[News] NewsAPI error:', e.message); }
        }
      }
      if (sources.includes('alphavantage')) {
        const key = newsCfg.alphavantage_key || '';
        if (key && key !== 'get_from_alphavantage_co') {
          try { allNews = allNews.concat(await fetchFromAlphaVantage(key, 10)); } catch (e) { console.error('[News] AlphaVantage error:', e.message); }
        }
      }
      if (allNews.length === 0) {
        allNews = getDemoNews();
      }

      allNews = allNews.slice(0, 10);

      if (!db.data.news_articles) db.data.news_articles = [];
      if (!db.data.signals) db.data.signals = [];

      const processed = [];
      for (const article of allNews) {
        const articleId = uuidv4();
        const sentiment = await analyzeSentiment(article);

        const newsDoc = {
          id: articleId,
          title: article.title,
          description: article.description,
          content: article.content || '',
          source: article.source,
          url: article.url,
          published_at: article.published_at,
          sentiment_analysis: sentiment,
          created_at: new Date().toISOString(),
        };

        db.data.news_articles.push(newsDoc);

        // Generate trading signal if conditions met
        let signalGenerated = false;
        if (sentiment.confidence >= 60 && sentiment.trading_signal !== 'HOLD') {
          const signal = generateSignal(newsDoc);
          if (signal) {
            db.data.signals.push(signal);
            executePaperTrade(signal);
            signalGenerated = true;
          }
        }

        processed.push({
          id: articleId,
          title: article.title,
          description: article.description,
          source: article.source,
          url: article.url,
          published_at: article.published_at,
          sentiment_analysis: sentiment,
          created_at: newsDoc.created_at,
          signal_generated: signalGenerated,
        });
      }

      db.save();
      res.json({ status: 'success', articles_processed: processed.length, articles: processed });
    } catch (err) {
      console.error('[News] Fetch error:', err);
      res.json({ status: 'error', message: err.message });
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

    const positionSize = Math.min(maxTrade, available * rp.max_position_size, dailyLimit - todayValue);
    if (positionSize < 1000) return null;

    const basePrice = 24000;
    const optionPremium = 150;
    const quantity = Math.floor(positionSize / optionPremium);
    if (quantity === 0) return null;

    const actualAmount = quantity * optionPremium;
    const stopLoss = optionPremium * (1 - rp.stop_loss_pct / 100);
    const target = optionPremium * (1 + rp.target_pct / 100);

    return {
      id: uuidv4(),
      signal_type: signalType,
      symbol: 'NIFTY50',
      strike_price: basePrice + (signalType === 'CALL' ? 500 : -500),
      option_premium: optionPremium,
      quantity,
      investment_amount: actualAmount,
      entry_price: optionPremium,
      stop_loss: Math.round(stopLoss * 100) / 100,
      target: Math.round(target * 100) / 100,
      confidence: sentiment.confidence,
      sentiment: sentiment.sentiment,
      reason: sentiment.reason,
      news_id: newsDoc.id,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
  }

  function executePaperTrade(signal) {
    if (!db.data.trades) db.data.trades = [];
    const trade = {
      id: uuidv4(),
      signal_id: signal.id,
      trade_type: signal.signal_type,
      symbol: signal.symbol,
      entry_time: new Date().toISOString(),
      entry_price: signal.entry_price,
      quantity: signal.quantity,
      investment: signal.investment_amount,
      stop_loss: signal.stop_loss,
      target: signal.target,
      status: 'OPEN',
      exit_time: null,
      exit_price: null,
      pnl: 0,
      pnl_percentage: 0,
    };
    db.data.trades.push(trade);

    // Update portfolio
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

  return router;
};
