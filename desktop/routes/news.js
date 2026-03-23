/**
 * News Routes (Refactored)
 * Slim route definitions using modular lib/ imports.
 */
const { Router } = require('express');
const crypto = require('crypto');
function uuid() { return crypto.randomUUID(); }
const { fetchAllNews } = require('./lib/news_fetcher');
const createSentimentAnalyzer = require('./lib/sentiment');
const createSignalGenerator = require('./lib/signal_generator');
let OpenAI; try { OpenAI = require('openai'); } catch (_) { OpenAI = null; }

module.exports = function (db) {
  const router = Router();
  const AIDecisionEngine = require('./ai_engine');
  // Create shared AI Engine instance (shared with trading.js via db)
  if (!db._sharedAIEngine) db._sharedAIEngine = new AIDecisionEngine(db);
  const aiEngine = db._sharedAIEngine;
  const sentiment = createSentimentAnalyzer(db, aiEngine);
  const signals = createSignalGenerator(db, aiEngine);

  // GET /api/news/fetch
  router.get('/api/news/fetch', async (req, res) => {
    try {
      // ===== EARLY GUARD CHECK: Block AI analysis if daily limits hit =====
      // This prevents wasting API key balance when trading is stopped for the day
      const isEmergencyStopped = db.data?.settings?.emergency_stop || false;
      let dailyGuardBlocked = false;
      let dailyGuardReason = '';

      if (isEmergencyStopped) {
        dailyGuardBlocked = true;
        dailyGuardReason = 'Emergency Stop active';
        console.log('[News] AI analysis SKIPPED - Emergency Stop active. Saving API balance.');
      }

      // Get today's ACTUAL P&L — from Broker in LIVE mode, local DB in PAPER mode
      let actualTodayPnl = 0;
      const currentMode = db.data?.settings?.trading_mode || 'PAPER';
      
      if (!dailyGuardBlocked) {
        if (currentMode === 'LIVE') {
          // LIVE: Fetch actual P&L from Upstox (same source as Risk Panel)
          const brokers = db.data?.settings?.brokers || {};
          const upstoxToken = brokers.upstox?.access_token || '';
          if (upstoxToken) {
            try {
              const headers = { Accept: 'application/json', Authorization: `Bearer ${upstoxToken}`, 'Api-Version': '2.0' };
              const posResp = await axios.get('https://api.upstox.com/v2/portfolio/short-term-positions', { headers, timeout: 10000 });
              if (posResp.data?.status === 'success') {
                let realizedPnl = 0, unrealizedPnl = 0;
                for (const pos of (posResp.data.data || [])) {
                  if (pos.quantity !== 0) {
                    unrealizedPnl += pos.unrealised || ((pos.last_price - pos.average_price) * Math.abs(pos.quantity));
                    realizedPnl += pos.realised || 0;
                  } else {
                    realizedPnl += pos.pnl || pos.realised || 0;
                  }
                }
                actualTodayPnl = Math.round((realizedPnl + unrealizedPnl) * 100) / 100;
                console.log(`[News] Broker actual P&L: ₹${actualTodayPnl}`);
              }
            } catch (e) {
              console.log(`[News] Broker P&L fetch failed, using local DB: ${e.message}`);
              const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
              const todayClosed = (db.data.trades || []).filter(t => t.status === 'CLOSED' && (t.exit_time || '') >= todayStart.toISOString());
              actualTodayPnl = todayClosed.reduce((sum, t) => sum + (t.pnl || 0), 0);
            }
          }
        } else {
          // PAPER: Use local DB
          const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
          const todayClosed = (db.data.trades || []).filter(t => t.status === 'CLOSED' && (t.exit_time || '') >= todayStart.toISOString());
          actualTodayPnl = todayClosed.reduce((sum, t) => sum + (t.pnl || 0), 0);
        }
      }

      if (!dailyGuardBlocked) {
        // Check Max Daily Loss (use actual P&L)
        const maxDailyLossEnabled = db.data?.settings?.ai_guards?.max_daily_loss !== false;
        if (maxDailyLossEnabled && actualTodayPnl < 0) {
          const maxDailyLoss = db.data?.settings?.auto_trading?.max_daily_loss || db.data?.settings?.risk?.max_daily_loss || 5000;
          if (Math.abs(actualTodayPnl) >= maxDailyLoss) {
            dailyGuardBlocked = true;
            dailyGuardReason = `Max Daily Loss hit: ₹${Math.abs(Math.round(actualTodayPnl))} >= ₹${maxDailyLoss}`;
            console.log(`[News] AI analysis SKIPPED - ${dailyGuardReason}. Saving API balance.`);
          }
        }
      }

      if (!dailyGuardBlocked) {
        // Check Max Daily Profit (use actual P&L)
        const maxDailyProfitEnabled = db.data?.settings?.ai_guards?.max_daily_profit !== false;
        if (maxDailyProfitEnabled && actualTodayPnl > 0) {
          const maxDailyProfit = db.data?.settings?.auto_trading?.max_daily_profit || db.data?.settings?.risk?.max_daily_profit || 10000;
          if (actualTodayPnl >= maxDailyProfit) {
            dailyGuardBlocked = true;
            dailyGuardReason = `Max Daily Profit target hit: ₹${Math.round(actualTodayPnl)} >= ₹${maxDailyProfit}`;
            console.log(`[News] AI analysis SKIPPED - ${dailyGuardReason}. Saving API balance.`);
          }
        }
      }

      // If daily guard is hit, return early - don't fetch/analyze news at all
      if (dailyGuardBlocked) {
        res.json({
          status: 'success',
          articles_processed: 0,
          articles: [],
          errors: [],
          guard_blocked: true,
          guard_reason: dailyGuardReason,
          message: `Analysis skipped: ${dailyGuardReason}. API key balance preserved.`,
        });
        return;
      }

      const newsCfg = db.data.settings?.news || { sources: ['demo'] };
      const { articles: allNewsRaw, errors } = await fetchAllNews(newsCfg);

      // Deduplicate
      const seenTitles = new Set();
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const existingTitles = new Set((db.data.news_articles || []).filter(n => (n.created_at || '') > oneHourAgo).map(n => (n.title || '').toLowerCase().trim()));
      let allNews = allNewsRaw.filter(a => { const norm = (a.title || '').toLowerCase().trim(); if (!norm || seenTitles.has(norm) || existingTitles.has(norm)) return false; seenTitles.add(norm); return true; }).slice(0, 10);

      if (!db.data.news_articles) db.data.news_articles = [];
      if (!db.data.signals) db.data.signals = [];

      const processed = [];
      for (const article of allNews) {
        const articleId = uuid();

        // OPTIMIZATION: Keyword pre-filter to save API calls
        // Only send market-relevant articles to AI
        const kwResult = sentiment.keywordSentiment(article);
        const isRelevant = kwResult.sentiment !== 'NEUTRAL' || kwResult.confidence > 55;

        let sentimentResult;
        if (isRelevant) {
          sentimentResult = await sentiment.analyzeSentiment(article);
          console.log(`[News] AI analysis for: ${(article.title || '').substring(0, 50)}...`);
        } else {
          sentimentResult = kwResult;
          console.log(`[News] Keyword-only (irrelevant): ${(article.title || '').substring(0, 50)}...`);
        }
        const newsDoc = { id: articleId, title: article.title, description: article.description, content: article.content || '', source: article.source, url: article.url, published_at: article.published_at, sentiment_analysis: sentimentResult, created_at: new Date().toISOString() };
        db.data.news_articles.push(newsDoc);

        let signalGenerated = false;
        const minConfidence = db.data?.settings?.news?.min_confidence || 70;
        if (sentimentResult.confidence >= minConfidence && sentimentResult.trading_signal !== 'HOLD') {
          // EMERGENCY STOP CHECK
          if (db.data?.settings?.emergency_stop) {
            console.log(`[News] Trade BLOCKED - Emergency Stop active for ${article.title}`);
          } else {
          const signal = signals.generateSignal(newsDoc);
          if (signal) {
            db.data.signals.push(signal);
            if (db.notify) db.notify('signal', `${signal.signal_type} Signal`, `${signal.symbol} | ${sentimentResult.sentiment} ${sentimentResult.confidence}% | ${sentimentResult.reason}`);

            // Telegram: Signal Alert
            const tgAlerts = db.data?.settings?.telegram?.alerts || {};
            if (tgAlerts.signals !== false) {
              const tg = require('./lib/telegram');
              tg.sendSignalAlert({ ...signal, reason: sentimentResult.reason }).catch(() => {});
            }

            const mode = db.data.settings?.trading_mode || 'PAPER';
            const autoEntryEnabled = db.data.settings?.auto_trading?.auto_entry || false;

            // AUTO_ENTRY CHECK - Only execute trades if auto_entry is ON
            if (!autoEntryEnabled) {
              console.log(`[News] Signal saved but NOT executed - Auto Entry is OFF (${signal.signal_type} ${signal.symbol})`);
              if (db.notify) db.notify('signal', 'Signal Saved (Auto Entry OFF)', `${signal.signal_type} ${signal.symbol} - Turn on Auto Entry to execute`);
            } else {
              const activeBroker = db.data.settings?.active_broker || db.data.settings?.broker?.name || 'upstox';
              const token = db.data.settings?.broker?.[`${activeBroker}_token`] || db.data.settings?.broker?.access_token;
              signal.mode = mode;

              if (mode === 'LIVE' && token) {
                const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
                const istDay = ist.getUTCDay();
                const istMins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
                const marketOpen = !(istDay === 0 || istDay === 6 || istMins < 555 || istMins > 930);

                if (!marketOpen) {
                  if (db.notify) db.notify('signal', 'Signal Saved', `${signal.signal_type} ${signal.symbol} - Market closed`);
                } else {
                  const maxOpenTrades = db.data?.settings?.risk?.max_open_trades || 5;
                  const openInInstrument = (db.data.trades || []).filter(t => t.status === 'OPEN' && (t.instrument === signal.symbol || t.symbol === signal.symbol) && t.mode === 'LIVE');
                  if (openInInstrument.length >= maxOpenTrades) {
                    if (db.notify) db.notify('signal', 'Signal Saved', `${signal.signal_type} ${signal.symbol} - Max ${maxOpenTrades} trades open`);
                  } else {
                    // FEATURE 1: Multi-Timeframe Confirmation before trade execution
                    const tfCheck = await signals.validateMultiTimeframe(signal);
                    if (!tfCheck.valid) {
                      console.log(`[News] Trade BLOCKED by Multi-TF: ${tfCheck.reason}`);
                      signal.status = 'BLOCKED_TF';
                      signal.block_reason = tfCheck.reason;
                      if (db.notify) db.notify('risk', 'Multi-TF Block', `${signal.signal_type} ${signal.symbol} - ${tfCheck.reason}`);
                      // Telegram: Guard Block Alert for Multi-TF
                      const tgGuardAlerts = db.data?.settings?.telegram?.alerts || {};
                      if (tgGuardAlerts.guard_blocks !== false) {
                        const tgLib = require('./lib/telegram');
                        tgLib.sendGuardBlockAlert('Multi-Timeframe', `${signal.signal_type} ${signal.symbol} - ${tfCheck.reason}`).catch(() => {});
                      }
                    } else {
                    try {
                      const result = await signals.executeLiveTrade(signal, token);
                      if (db.notify) db.notify('entry', `LIVE ${signal.signal_type} Entry`, `${signal.symbol} | ${result.success ? 'Order: ' + result.order_id : 'FAILED: ' + (result.error || '')}`);
                    } catch (tradeErr) {
                      if (!db.data.trades) db.data.trades = [];
                      db.data.trades.push({ id: uuid(), signal_id: signal.id, trade_type: signal.signal_type, symbol: signal.symbol, entry_time: new Date().toISOString(), entry_price: signal.entry_price, quantity: signal.quantity, investment: signal.investment_amount, status: 'FAILED', mode: 'LIVE', error: tradeErr.message });
                      if (db.notify) db.notify('error', 'Trade Failed', `${signal.symbol} ${signal.signal_type}: ${tradeErr.message}`);
                    }
                    }
                  }
                }
              } else if (mode === 'PAPER') {
                signal.mode = 'PAPER';
                signals.executePaperTrade(signal);
                if (db.notify) db.notify('entry', `Paper ${signal.signal_type} Entry`, `${signal.symbol} | Qty: ${signal.quantity}`);
              }
            }
            signalGenerated = true;
          }
          }
        }
        processed.push({ id: articleId, title: article.title, description: article.description, source: article.source, url: article.url, published_at: article.published_at, sentiment_analysis: sentimentResult, created_at: newsDoc.created_at, signal_generated: signalGenerated });
      }
      db.save();

      // Auto-entry for untraded signals (BLOCKED by emergency stop)
      const autoEntryOn = db.data.settings?.auto_trading?.auto_entry || false;
      const emergencyStopped = db.data?.settings?.emergency_stop || false;
      const mode = db.data.settings?.trading_mode || 'PAPER';
      const activeBroker2 = db.data.settings?.active_broker || db.data.settings?.broker?.name || 'upstox';
      const token2 = db.data.settings?.broker?.[`${activeBroker2}_token`] || db.data.settings?.broker?.access_token;
      if (autoEntryOn && !emergencyStopped && mode === 'LIVE' && token2) {
        const recentTradeSignalIds = new Set((db.data.trades || []).filter(t => t.mode === 'LIVE' && (t.status === 'OPEN' || (t.status === 'FAILED' && (t.entry_time || '') > new Date(Date.now() - 30 * 60 * 1000).toISOString()))).map(t => t.signal_id));
        const untradedSignals = (db.data.signals || []).filter(s => s.status === 'ACTIVE' && s.mode === 'LIVE' && !recentTradeSignalIds.has(s.id)).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 1);
        for (const sig of untradedSignals) {
          try { await signals.executeLiveTrade(sig, token2); } catch (autoErr) { console.error(`[AutoEntry] Failed: ${autoErr.message}`); }
        }
      }

      res.json({ status: 'success', articles_processed: processed.length, articles: processed, errors });
    } catch (err) {
      console.error('[News] Fetch error:', err);
      res.json({ status: 'error', message: err.message, articles: [], errors: [{ source: 'system', error: err.message }] });
    }
  });

  // GET /api/news/latest
  router.get('/api/news/latest', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const news = (db.data.news_articles || []).slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, limit);
    res.json({ status: 'success', count: news.length, news });
  });

  // GET /api/ai/insights
  router.get('/api/ai/insights', (req, res) => {
    const insights = aiEngine.getAIInsights();
    const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
    const weekday = ist.getUTCDay();
    const totalMin = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    insights.market_status = { is_open: weekday >= 1 && weekday <= 5 && totalMin >= 555 && totalMin < 930, message: weekday >= 1 && weekday <= 5 && totalMin >= 555 && totalMin < 930 ? 'Market Open' : 'Market Closed' };

    const currentMode = db.data.settings?.trading_mode || 'PAPER';
    const modeSignals = (db.data.signals || []).filter(s => (s.mode || 'PAPER') === currentMode).slice(-20);
    const trades = (db.data.trades || []).filter(t => t.status === 'CLOSED' && (t.mode || 'PAPER') === currentMode).slice(-20);
    insights.performance = { recent_signals: modeSignals.length, closed_trades: trades.length, win_rate: trades.length > 0 ? Math.round((trades.filter(t => t.pnl > 0).length / trades.length) * 100) : 0, total_pnl: Math.round(trades.reduce((s, t) => s + (t.pnl || 0), 0) * 100) / 100, avg_confidence: modeSignals.length > 0 ? Math.round(modeSignals.reduce((s, sig) => s + (sig.confidence || 0), 0) / modeSignals.length) : 0, mode: currentMode };
    res.json({ status: 'success', insights });
  });

  // POST /api/ai/trade-review
  router.post('/api/ai/trade-review', async (req, res) => {
    const { trade_id } = req.body;
    const trade = (db.data.trades || []).find(t => t.id === trade_id);
    if (!trade) return res.json({ status: 'error', message: 'Trade not found' });
    if (trade.status !== 'CLOSED') return res.json({ status: 'error', message: 'Trade still open' });
    const aiKey = db.data.settings?.ai?.emergent_llm_key || '';
    const review = await aiEngine.generateTradeReview(trade, OpenAI, aiKey);
    if (review) {
      trade.ai_review = review; trade.reviewed_at = new Date().toISOString();
      if (!db.data.historical_patterns) db.data.historical_patterns = [];
      db.data.historical_patterns.push({ sector: trade.sector || 'BROAD_MARKET', sentiment: trade.sentiment || 'NEUTRAL', was_profitable: trade.pnl > 0, pnl: trade.pnl, pnl_pct: trade.pnl_percentage, trade_type: trade.trade_type, date: new Date().toISOString() });
      db.save();
    }
    res.json({ status: 'success', review: review || 'AI review unavailable (no API key)' });
  });

  // GET /api/ai/heatmap
  router.get('/api/ai/heatmap', (req, res) => {
    const sectors = ['BANKING', 'IT', 'PHARMA', 'AUTO', 'ENERGY', 'METAL', 'FMCG', 'INFRA', 'REALTY', 'BROAD_MARKET'];
    const timeBuckets = ['0-4h', '4-8h', '8-12h', '12-16h', '16-20h', '20-24h'];
    const now = Date.now(); const cutoff = now - 86400000;
    const heatmap = {}; const sectorSummary = {};
    for (const s of sectors) { heatmap[s] = {}; sectorSummary[s] = { bullish: 0, bearish: 0, neutral: 0, total: 0, avg_confidence: 0, confs: [] }; for (const b of timeBuckets) { heatmap[s][b] = { bullish: 0, bearish: 0, neutral: 0, total: 0, avg_confidence: 0, confs: [] }; } }
    function getBucket(createdAt) { const hoursAgo = (now - new Date(createdAt).getTime()) / 3600000; if (hoursAgo < 4) return '0-4h'; if (hoursAgo < 8) return '4-8h'; if (hoursAgo < 12) return '8-12h'; if (hoursAgo < 16) return '12-16h'; if (hoursAgo < 20) return '16-20h'; return '20-24h'; }
    function addEntry(sector, sent, conf, createdAt) { if (!sectors.includes(sector)) sector = 'BROAD_MARKET'; const b = getBucket(createdAt); const cell = heatmap[sector][b]; cell.total++; cell.confs.push(conf); if (sent === 'BULLISH') cell.bullish++; else if (sent === 'BEARISH') cell.bearish++; else cell.neutral++; const ss = sectorSummary[sector]; ss.total++; ss.confs.push(conf); if (sent === 'BULLISH') ss.bullish++; else if (sent === 'BEARISH') ss.bearish++; else ss.neutral++; }
    for (const art of (db.data.news_articles || [])) { if (new Date(art.created_at).getTime() < cutoff) continue; const sa = art.sentiment_analysis || {}; addEntry(sa.sector || 'BROAD_MARKET', sa.sentiment || 'NEUTRAL', sa.confidence || 50, art.created_at); }
    for (const sig of (db.data.signals || [])) { if (new Date(sig.created_at).getTime() < cutoff) continue; addEntry(sig.sector || 'BROAD_MARKET', sig.sentiment || 'NEUTRAL', sig.composite_score || sig.confidence || 50, sig.created_at); }
    for (const s of sectors) { for (const b of timeBuckets) { const c = heatmap[s][b]; if (c.confs.length) c.avg_confidence = Math.round(c.confs.reduce((a, b) => a + b, 0) / c.confs.length); delete c.confs; } const ss = sectorSummary[s]; if (ss.confs.length) ss.avg_confidence = Math.round(ss.confs.reduce((a, b) => a + b, 0) / ss.confs.length); delete ss.confs; }
    res.json({ status: 'success', heatmap, sector_summary: sectorSummary, active_sectors: Object.fromEntries(Object.entries(sectorSummary).filter(([_, v]) => v.total > 0)), time_buckets: timeBuckets, sectors });
  });

  return router;
};
