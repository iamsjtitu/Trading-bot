const { Router } = require('express');
const crypto = require('crypto');
const axios = require('axios');
let OpenAI;
try { OpenAI = require('openai'); } catch (_) { OpenAI = null; }

function uuid() { return crypto.randomUUID(); }

module.exports = function (db) {
  const router = Router();

  // Instrument exchange mapping for market hours check
  const INSTRUMENTS = {
    NIFTY50: { exchange: 'NSE' }, BANKNIFTY: { exchange: 'NSE' },
    FINNIFTY: { exchange: 'NSE' }, MIDCPNIFTY: { exchange: 'NSE' },
    SENSEX: { exchange: 'BSE' }, BANKEX: { exchange: 'BSE' },
  };

  // Internal state for auto-trading settings - LOAD from saved settings
  const savedAutoTrading = db.data.settings?.auto_trading || {};
  let autoExitEnabled = savedAutoTrading.auto_exit !== false;
  let autoEntryEnabled = savedAutoTrading.auto_entry || false;
  let customTargetPct = savedAutoTrading.target_pct || null;
  let customStoplossPct = savedAutoTrading.stoploss_pct || null;
  console.log(`[Trading] Loaded auto settings: exit=${autoExitEnabled}, entry=${autoEntryEnabled}`);

  const riskParams = {
    low: { stop_loss_pct: 15, target_pct: 30, max_position_size: 0.03 },
    medium: { stop_loss_pct: 25, target_pct: 50, max_position_size: 0.05 },
    high: { stop_loss_pct: 35, target_pct: 70, max_position_size: 0.07 },
  };

  function getRiskTolerance() {
    return db.data.settings?.risk?.risk_tolerance || 'medium';
  }

  // GET /api/signals/latest
  router.get('/api/signals/latest', (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const currentMode = db.data.settings?.trading_mode || 'PAPER';
    const signals = (db.data.signals || [])
      .filter(s => (s.mode || 'PAPER') === currentMode)
      .slice()
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, limit);
    res.json({ status: 'success', count: signals.length, signals });
  });

  // GET /api/signals/active
  router.get('/api/signals/active', (req, res) => {
    const currentMode = db.data.settings?.trading_mode || 'PAPER';
    const signals = (db.data.signals || []).filter(s => s.status === 'ACTIVE' && (s.mode || 'PAPER') === currentMode);
    res.json({ status: 'success', count: signals.length, signals });
  });

  // GET /api/trades/active
  router.get('/api/trades/active', async (req, res) => {
    const mode = db.data.settings?.trading_mode || 'PAPER';

    if (mode === 'LIVE') {
      // In LIVE mode, fetch real positions from Upstox instead of paper trades
      const token = db.data.settings?.broker?.access_token;
      if (!token) {
        return res.json({ status: 'success', count: 0, trades: [], message: 'Upstox not connected' });
      }

      try {
        const headers = { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' };
        const posResp = await axios.get('https://api.upstox.com/v2/portfolio/short-term-positions', { headers, timeout: 10000 });

        if (posResp.data?.status === 'success') {
          const positions = (posResp.data.data || []).filter(p => p.quantity !== 0);
          const tradesFromPositions = positions.map(pos => ({
            trade_type: pos.quantity > 0 ? 'BUY' : 'SELL',
            symbol: pos.trading_symbol || 'N/A',
            quantity: Math.abs(pos.quantity),
            status: 'OPEN',
            entry_price: pos.average_price || 0,
            current_price: pos.last_price || 0,
            current_value: (pos.last_price || 0) * Math.abs(pos.quantity),
            investment: (pos.average_price || 0) * Math.abs(pos.quantity),
            live_pnl: Math.round((pos.pnl || 0) * 100) / 100,
            pnl_percentage: pos.average_price > 0
              ? Math.round(((pos.last_price - pos.average_price) / pos.average_price) * 10000) / 100
              : 0,
            stop_loss: 0,
            target: 0,
            entry_time: new Date().toISOString(),
            isLive: true,
            instrument_token: pos.instrument_token || '',
            product: pos.product || '',
          }));
          return res.json({ status: 'success', count: tradesFromPositions.length, trades: tradesFromPositions, isLive: true });
        }
      } catch (err) {
        console.error('[Trades] Live positions fetch error:', err.message);
      }
      // Fallback: return empty if Upstox call fails
      return res.json({ status: 'success', count: 0, trades: [], isLive: true, message: 'Could not fetch live positions' });
    }

    // PAPER mode: return simulated trades
    const openTrades = (db.data.trades || []).filter(t => t.status === 'OPEN');
    const tradesWithPnl = openTrades.map(trade => {
      const change = (Math.random() - 0.5) * 0.3;
      const currentPrice = trade.entry_price * (1 + change);
      const currentValue = currentPrice * trade.quantity;
      const pnl = currentValue - trade.investment;
      const pnlPct = (pnl / trade.investment) * 100;
      return {
        ...trade,
        current_price: Math.round(currentPrice * 100) / 100,
        current_value: Math.round(currentValue * 100) / 100,
        live_pnl: Math.round(pnl * 100) / 100,
        pnl_percentage: Math.round(pnlPct * 100) / 100,
      };
    });
    res.json({ status: 'success', count: tradesWithPnl.length, trades: tradesWithPnl });
  });

  // GET /api/trades/today
  router.get('/api/trades/today', (req, res) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();
    const currentMode = db.data.settings?.trading_mode || 'PAPER';

    const allTrades = (db.data.trades || []).filter(t => (t.entry_time || '') >= todayISO && (t.mode || 'PAPER') === currentMode);
    const closed = allTrades.filter(t => t.status === 'CLOSED');
    const open = allTrades.filter(t => t.status === 'OPEN');
    const todayPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);
    const todayInvested = allTrades.reduce((s, t) => s + (t.investment || 0), 0);

    res.json({
      status: 'success',
      total_trades_today: allTrades.length,
      closed_trades: closed.length,
      open_trades: open.length,
      today_pnl: Math.round(todayPnl * 100) / 100,
      today_invested: Math.round(todayInvested * 100) / 100,
    });
  });

  // GET /api/trades/history (enhanced with filters)
  router.get('/api/trades/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 200;
    const { trade_type, status, date_from, date_to, sort_by, sort_order, mode } = req.query;

    let trades = (db.data.trades || []).slice();

    // Filter by trading mode (PAPER/LIVE) - default to current mode
    const currentMode = db.data.settings?.trading_mode || 'PAPER';
    const filterMode = mode || currentMode;
    if (filterMode !== 'all') {
      trades = trades.filter(t => (t.mode || 'PAPER') === filterMode);
    }

    // Apply filters
    if (trade_type && trade_type !== 'all') {
      trades = trades.filter(t => t.trade_type === trade_type);
    }
    if (status && status !== 'all') {
      trades = trades.filter(t => t.status === status);
    }
    if (date_from) {
      trades = trades.filter(t => (t.entry_time || '') >= date_from);
    }
    if (date_to) {
      trades = trades.filter(t => (t.entry_time || '') <= date_to + 'T23:59:59');
    }

    // Sort
    const field = ['entry_time', 'pnl', 'investment', 'pnl_percentage'].includes(sort_by) ? sort_by : 'entry_time';
    const dir = sort_order === 'asc' ? 1 : -1;
    trades.sort((a, b) => {
      const va = a[field] || 0;
      const vb = b[field] || 0;
      if (typeof va === 'string') return dir * va.localeCompare(vb);
      return dir * (va - vb);
    });

    trades = trades.slice(0, limit);

    // Summary stats
    const closed = trades.filter(t => t.status === 'CLOSED');
    const wins = closed.filter(t => (t.pnl || 0) > 0);
    const losses = closed.filter(t => (t.pnl || 0) <= 0);
    const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
    const totalInvestment = trades.reduce((s, t) => s + (t.investment || 0), 0);

    const summary = {
      total_trades: trades.length,
      closed_trades: closed.length,
      open_trades: trades.filter(t => t.status === 'OPEN').length,
      winning_trades: wins.length,
      losing_trades: losses.length,
      win_rate: closed.length ? Math.round((wins.length / closed.length) * 1000) / 10 : 0,
      total_pnl: Math.round(totalPnl * 100) / 100,
      avg_win: Math.round(avgWin * 100) / 100,
      avg_loss: Math.round(avgLoss * 100) / 100,
      total_investment: Math.round(totalInvestment * 100) / 100,
      best_trade: closed.length ? Math.round(Math.max(...closed.map(t => t.pnl || 0)) * 100) / 100 : 0,
      worst_trade: closed.length ? Math.round(Math.min(...closed.map(t => t.pnl || 0)) * 100) / 100 : 0,
    };

    res.json({ status: 'success', count: trades.length, trades, summary });
  });

  // GET /api/daily-summary
  router.get('/api/daily-summary', (req, res) => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const allTrades = (db.data.trades || []).filter(t => (t.entry_time || '') >= todayISO);
    const closed = allTrades.filter(t => t.status === 'CLOSED');
    const open = allTrades.filter(t => t.status === 'OPEN');
    const wins = closed.filter(t => (t.pnl || 0) > 0);
    const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);
    const totalInvested = allTrades.reduce((s, t) => s + (t.investment || 0), 0);
    const signals = (db.data.signals || []).filter(s => (s.created_at || '') >= todayISO);
    const newsCount = (db.data.news_articles || []).filter(n => (n.created_at || '') >= todayISO).length;

    res.json({
      status: 'success',
      summary: {
        date: todayStart.toISOString().split('T')[0],
        total_trades: allTrades.length,
        closed_trades: closed.length,
        open_trades: open.length,
        winning_trades: wins.length,
        losing_trades: closed.length - wins.length,
        win_rate: closed.length ? Math.round((wins.length / closed.length) * 1000) / 10 : 0,
        total_pnl: Math.round(totalPnl * 100) / 100,
        total_invested: Math.round(totalInvested * 100) / 100,
        signals_generated: signals.length,
        news_analyzed: newsCount,
        best_trade: closed.length ? Math.round(Math.max(...closed.map(t => t.pnl || 0)) * 100) / 100 : 0,
        worst_trade: closed.length ? Math.round(Math.min(...closed.map(t => t.pnl || 0)) * 100) / 100 : 0,
      },
    });
  });

  // POST /api/telegram/send-daily-summary
  router.post('/api/telegram/send-daily-summary', async (req, res) => {
    try {
      const settings = db.data.settings || {};
      const telegram = settings.telegram || {};
      if (!telegram.enabled || !telegram.bot_token || !telegram.chat_id) {
        return res.json({ status: 'error', message: 'Telegram not configured. Enable it in Settings > Advanced > Telegram.' });
      }

      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();
      const allTrades = (db.data.trades || []).filter(t => (t.entry_time || '') >= todayISO);
      const closed = allTrades.filter(t => t.status === 'CLOSED');
      const open = allTrades.filter(t => t.status === 'OPEN');
      const wins = closed.filter(t => (t.pnl || 0) > 0);
      const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);
      const portfolio = db.data.portfolio || {};
      const mode = settings.trading_mode || 'PAPER';
      const pnlSign = totalPnl >= 0 ? '+' : '';

      const message = `*AI Trading Bot - Daily Summary*
*Date:* ${todayStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
*Mode:* ${mode}

*Today's Performance:*
Total Trades: ${allTrades.length}
Closed: ${closed.length} | Open: ${open.length}
Winning: ${wins.length} | Losing: ${closed.length - wins.length}
Win Rate: ${closed.length ? Math.round((wins.length / closed.length) * 1000) / 10 : 0}%

*P&L: ${pnlSign}${Math.round(totalPnl).toLocaleString()}*

*Portfolio:*
Value: ${Math.round(portfolio.current_value || 500000).toLocaleString()}
Total P&L: ${Math.round(portfolio.total_pnl || 0).toLocaleString()}

_Sent automatically by AI Trading Bot_`;

      const telegramUrl = `https://api.telegram.org/bot${telegram.bot_token}/sendMessage`;
      const resp = await axios.post(telegramUrl, { chat_id: telegram.chat_id, text: message, parse_mode: 'Markdown' }, { timeout: 15000 });
      if (resp.data?.ok) {
        res.json({ status: 'success', message: 'Daily summary sent to Telegram!' });
      } else {
        res.json({ status: 'error', message: `Telegram error: ${resp.data?.description || 'Unknown'}` });
      }
    } catch (err) {
      console.error('[Telegram] Daily summary error:', err.message);
      res.json({ status: 'error', message: err.message });
    }
  });

  // POST /api/auto-exit/check
  router.post('/api/auto-exit/check', async (req, res) => {
    if (!autoExitEnabled) {
      return res.json({ status: 'success', exits_executed: 0, new_trades_generated: 0 });
    }

    const trades = db.data.trades || [];
    const openTrades = trades.filter(t => t.status === 'OPEN');
    let exitsCount = 0;
    let newTradesCount = 0;
    const exitDetails = [];
    const tolerance = getRiskTolerance();
    const rp = riskParams[tolerance] || riskParams.medium;

    const targetPct = customTargetPct != null ? customTargetPct : rp.target_pct;
    const stoplossPct = customStoplossPct != null ? customStoplossPct : rp.stop_loss_pct;

    const mode = db.data.settings?.trading_mode || 'PAPER';
    const accessToken = db.data.settings?.broker?.access_token;

    for (const trade of openTrades) {
      let currentPrice;

      if (mode === 'LIVE' && accessToken && trade.instrument_token) {
        // Fetch real-time price from Upstox for LIVE trades
        try {
          const ltp = await axios.get(`https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodeURIComponent(trade.instrument_token)}`, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' },
            timeout: 10000,
          });
          const quotes = ltp.data?.data || {};
          const key = Object.keys(quotes)[0];
          currentPrice = quotes[key]?.last_price || null;
          if (!currentPrice) {
            console.log(`[AutoExit] No LTP for ${trade.instrument_token}, skipping`);
            continue;
          }
        } catch (err) {
          console.error(`[AutoExit] LTP fetch error for ${trade.symbol}:`, err.message);
          continue;
        }
      } else {
        // Paper mode: simulate price movement
        const change = (Math.random() - 0.5) * 0.3;
        currentPrice = trade.entry_price * (1 + change);
      }

      const targetPrice = trade.entry_price * (1 + targetPct / 100);
      const stoplossPrice = trade.entry_price * (1 - stoplossPct / 100);

      let shouldExit = false;
      let exitReason = '';

      if (currentPrice >= targetPrice) { shouldExit = true; exitReason = 'TARGET_HIT'; }
      else if (currentPrice <= stoplossPrice) { shouldExit = true; exitReason = 'STOPLOSS_HIT'; }

      if (shouldExit) {
        // If LIVE mode, place sell order on Upstox
        if (mode === 'LIVE' && accessToken && trade.instrument_token) {
          try {
            const sellBody = {
              quantity: trade.quantity,
              product: 'D',
              validity: 'DAY',
              price: 0,
              instrument_token: trade.instrument_token,
              order_type: 'MARKET',
              transaction_type: 'SELL',
              disclosed_quantity: 0,
              trigger_price: 0,
              is_amo: false,
            };
            const sellResp = await axios.post('https://api.upstox.com/v2/order/place', sellBody, {
              headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0', 'Content-Type': 'application/json' },
              timeout: 15000,
            });
            console.log(`[AutoExit] LIVE sell order placed: ${sellResp.data?.data?.order_id || 'unknown'} for ${trade.symbol}`);
            trade.exit_order_id = sellResp.data?.data?.order_id || '';
          } catch (err) {
            console.error(`[AutoExit] LIVE sell order failed for ${trade.symbol}:`, err.message);
            trade.exit_error = err.message;
          }
        }

        const currentValue = currentPrice * trade.quantity;
        const pnl = currentValue - trade.investment;
        const pnlPct = (pnl / trade.investment) * 100;

        // Update trade in-place
        trade.status = 'CLOSED';
        trade.exit_time = new Date().toISOString();
        trade.exit_price = Math.round(currentPrice * 100) / 100;
        trade.pnl = Math.round(pnl * 100) / 100;
        trade.pnl_percentage = Math.round(pnlPct * 100) / 100;
        trade.exit_reason = exitReason;

        // Update portfolio
        const p = db.data.portfolio;
        if (p) {
          p.available_capital = (p.available_capital || 0) + currentValue;
          p.invested_amount = (p.invested_amount || 0) - trade.investment;
          p.total_pnl = (p.total_pnl || 0) + pnl;
          p.total_trades = (p.total_trades || 0) + 1;
          if (pnl > 0) p.winning_trades = (p.winning_trades || 0) + 1;
          else p.losing_trades = (p.losing_trades || 0) + 1;
          p.last_updated = new Date().toISOString();
        }

        // Update signal
        const sig = (db.data.signals || []).find(s => s.id === trade.signal_id);
        if (sig) sig.status = 'CLOSED';

        // Track historical pattern for AI
        if (!db.data.historical_patterns) db.data.historical_patterns = [];
        db.data.historical_patterns.push({
          id: crypto.randomUUID(),
          sentiment: trade.sentiment || sig?.sentiment,
          sector: sig?.sector || 'BROAD_MARKET',
          trade_type: trade.trade_type,
          pnl: trade.pnl,
          pnl_percentage: trade.pnl_percentage,
          exit_reason: exitReason,
          entry_time: trade.entry_time,
          exit_time: trade.exit_time,
          confidence: sig?.confidence,
          was_profitable: pnl > 0,
          created_at: new Date().toISOString(),
        });

        // AI-powered trade review (async, non-blocking)
        const aiKey = db.data.settings?.ai?.emergent_llm_key || '';
        if (aiKey && OpenAI) {
          const AIDecisionEngine = require('./ai_engine');
          const tempEngine = new AIDecisionEngine(db);
          tempEngine.generateTradeReview(trade, OpenAI, aiKey).then(review => {
            if (review) {
              trade.ai_review = review;
              trade.reviewed_at = new Date().toISOString();
              db.save();
              console.log(`[AI Review] Trade ${trade.id}: ${review.substring(0, 100)}...`);
            }
          }).catch(() => {});
          // Update AI engine trade results
          tempEngine.updateTradeResult({ pnl, sector: sig?.sector || 'BROAD_MARKET', sentiment: trade.sentiment });
        }

        exitsCount++;
        exitDetails.push({
          trade_id: trade.id, symbol: trade.symbol, type: trade.trade_type,
          entry: trade.entry_price, exit: currentPrice,
          pnl: Math.round(pnl * 100) / 100, pnl_pct: Math.round(pnlPct * 100) / 100, reason: exitReason,
        });

        // Desktop + Telegram notification for exit
        const pnlSign = pnl >= 0 ? '+' : '';
        if (db.notify) db.notify('exit', `${exitReason === 'TARGET_HIT' ? 'Target Hit' : 'Stoploss Hit'} - ${trade.trade_type}`, `${trade.symbol} | P&L: ${pnlSign}${Math.round(pnl)} (${pnlSign}${Math.round(pnlPct)}%) | Exit: ${Math.round(currentPrice * 100) / 100}`);

        // Auto-entry on profitable exit
        if (autoEntryEnabled && exitReason === 'TARGET_HIT') {
          const news = (db.data.news_articles || [])
            .filter(n => n.sentiment_analysis && n.sentiment_analysis.confidence >= 60 && ['BUY_CALL', 'BUY_PUT'].includes(n.sentiment_analysis.trading_signal))
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
          const latestNews = news[0] || (db.data.news_articles || []).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];

          if (latestNews) {
            const newSignal = _generateSignal(latestNews);
            if (newSignal) {
              db.data.signals.push(newSignal);
              if (mode === 'LIVE' && accessToken) {
                // Place live entry for new trade too
                const newTrade = await executeLiveAutoEntry(newSignal, accessToken);
                if (newTrade) newTradesCount++;
              } else {
                _executePaperTrade(newSignal);
                newTradesCount++;
              }
            }
          }
        }
      }
    }

    if (exitsCount > 0) db.save();

    res.json({
      status: 'success',
      exits_executed: exitsCount,
      new_trades_generated: newTradesCount,
      details: exitDetails,
    });
  });

  // POST /api/auto-settings/update
  router.post('/api/auto-settings/update', (req, res) => {
    const body = req.body || {};
    if ('auto_exit' in body) autoExitEnabled = body.auto_exit;
    if ('auto_entry' in body) autoEntryEnabled = body.auto_entry;
    if ('target_pct' in body) customTargetPct = body.target_pct;
    if ('stoploss_pct' in body) customStoplossPct = body.stoploss_pct;

    // Persist to settings
    if (!db.data.settings) db.data.settings = {};
    if (!db.data.settings.auto_trading) db.data.settings.auto_trading = {};
    db.data.settings.auto_trading.auto_exit = autoExitEnabled;
    db.data.settings.auto_trading.auto_entry = autoEntryEnabled;
    if (customTargetPct != null) db.data.settings.auto_trading.target_pct = customTargetPct;
    if (customStoplossPct != null) db.data.settings.auto_trading.stoploss_pct = customStoplossPct;
    db.save();

    res.json({
      status: 'success',
      settings: {
        auto_exit: autoExitEnabled,
        auto_entry: autoEntryEnabled,
        target_pct: customTargetPct != null ? customTargetPct : (riskParams[getRiskTolerance()] || riskParams.medium).target_pct,
        stoploss_pct: customStoplossPct != null ? customStoplossPct : (riskParams[getRiskTolerance()] || riskParams.medium).stop_loss_pct,
      },
    });
  });

  // GET /api/auto-settings
  router.get('/api/auto-settings', (req, res) => {
    const rp = riskParams[getRiskTolerance()] || riskParams.medium;
    res.json({
      status: 'success',
      settings: {
        auto_exit: autoExitEnabled,
        auto_entry: autoEntryEnabled,
        target_pct: customTargetPct != null ? customTargetPct : rp.target_pct,
        stoploss_pct: customStoplossPct != null ? customStoplossPct : rp.stop_loss_pct,
      },
    });
  });

  // POST /api/test/generate-trade
  router.post('/api/test/generate-trade', (req, res) => {
    const newsArr = (db.data.news_articles || []).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const latestNews = newsArr[0];

    if (!latestNews) {
      return res.json({ status: 'failed', message: 'No news available' });
    }

    const signal = _generateSignal(latestNews);
    if (signal) {
      db.data.signals.push(signal);
      _executePaperTrade(signal);
      db.save();
      return res.json({ status: 'success', message: 'New trade generated', signal });
    }
    res.json({ status: 'failed', message: 'Could not generate signal - check confidence or limits' });
  });

  // ============ Helpers ============
  function _isMarketOpen(instrument) {
    const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
    const weekday = ist.getUTCDay();
    const h = ist.getUTCHours();
    const m = ist.getUTCMinutes();
    const totalMin = h * 60 + m;
    if (weekday < 1 || weekday > 5) return false;

    const inst = INSTRUMENTS[instrument] || {};
    if (inst.exchange === 'MCX') {
      return totalMin >= 540 && totalMin < 1410; // 9:00 AM - 11:30 PM IST
    }
    return totalMin >= 555 && totalMin < 930; // 9:15 AM - 3:30 PM IST
  }

  function _generateSignal(newsDoc) {
    const sentiment = newsDoc.sentiment_analysis || {};
    if (sentiment.confidence < 60 || sentiment.trading_signal === 'HOLD') return null;

    // Check market hours
    const activeInstrument = db.data?.settings?.active_instrument || 'NIFTY50';
    if (!_isMarketOpen(activeInstrument)) {
      console.log('[Signal] Market closed, skipping signal generation');
      return null;
    }

    const signalType = sentiment.trading_signal === 'BUY_CALL' ? 'CALL' : 'PUT';
    const portfolio = db.data.portfolio || {};
    const available = portfolio.available_capital || 500000;

    const riskCfg = db.data.settings?.risk || {};
    const tolerance = riskCfg.risk_tolerance || 'medium';
    const rp = riskParams[tolerance] || riskParams.medium;
    const maxTrade = riskCfg.max_per_trade || 20000;
    const dailyLimit = riskCfg.daily_limit || 100000;

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayTrades = (db.data.trades || []).filter(t => t.entry_time >= todayStart.toISOString());
    const todayValue = todayTrades.reduce((s, t) => s + (t.investment || 0), 0);
    if (todayValue >= dailyLimit) return null;

    const positionSize = Math.min(maxTrade, available * rp.max_position_size, dailyLimit - todayValue);
    if (positionSize < 1000) return null;

    const optionPremium = 150;
    const quantity = Math.floor(positionSize / optionPremium);
    if (quantity === 0) return null;

    const settings = db.data?.settings || {};
    const tradingMode = settings.trading_mode || 'PAPER';

    return {
      id: uuid(),
      signal_type: signalType,
      symbol: activeInstrument,
      strike_price: 24000 + (signalType === 'CALL' ? 500 : -500),
      option_premium: optionPremium,
      quantity,
      investment_amount: quantity * optionPremium,
      entry_price: optionPremium,
      stop_loss: Math.round(optionPremium * (1 - rp.stop_loss_pct / 100) * 100) / 100,
      target: Math.round(optionPremium * (1 + rp.target_pct / 100) * 100) / 100,
      confidence: sentiment.confidence,
      sentiment: sentiment.sentiment,
      reason: sentiment.reason,
      news_id: newsDoc.id,
      status: 'ACTIVE',
      mode: tradingMode,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
  }

  function _executePaperTrade(signal) {
    if (!db.data.trades) db.data.trades = [];
    const settings = db.data.settings || {};
    const tradingMode = settings.trading_mode || 'PAPER';
    const trade = {
      id: uuid(),
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
      mode: tradingMode,
      exit_time: null,
      exit_price: null,
      pnl: 0,
      pnl_percentage: 0,
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
  }

  // ============ Live Auto-Entry Helper ============
  async function executeLiveAutoEntry(signal, accessToken) {
    const headers = { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0', 'Content-Type': 'application/json' };
    try {
      const optionType = signal.signal_type === 'CALL' ? 'CE' : 'PE';
      const now = new Date();
      const year = String(now.getFullYear()).slice(2);
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const instrumentToken = `NSE_FO|NIFTY${year}${month}${day}${signal.strike_price}${optionType}`;

      const orderBody = {
        quantity: signal.quantity, product: 'D', validity: 'DAY', price: 0,
        instrument_token: instrumentToken, order_type: 'MARKET', transaction_type: 'BUY',
        disclosed_quantity: 0, trigger_price: 0, is_amo: false,
      };

      const orderResp = await axios.post('https://api.upstox.com/v2/order/place', orderBody, { headers, timeout: 15000 });
      const orderId = orderResp.data?.data?.order_id || '';
      const success = orderResp.data?.status === 'success';

      if (!db.data.trades) db.data.trades = [];
      const trade = {
        id: crypto.randomUUID(), signal_id: signal.id, trade_type: signal.signal_type,
        symbol: signal.symbol, entry_time: new Date().toISOString(),
        entry_price: signal.entry_price, quantity: signal.quantity,
        investment: signal.investment_amount, stop_loss: signal.stop_loss,
        target: signal.target, status: success ? 'OPEN' : 'FAILED',
        mode: 'LIVE', order_id: orderId, instrument_token: instrumentToken,
        exit_time: null, exit_price: null, pnl: 0, pnl_percentage: 0,
      };
      db.data.trades.push(trade);
      db.save();
      console.log(`[AutoEntry] LIVE order ${success ? 'placed' : 'failed'}: ${orderId}`);
      if (db.notify) db.notify('entry', `LIVE Re-Entry ${signal.signal_type}`, `${signal.symbol} | Qty: ${signal.quantity} | ${success ? 'Order: ' + orderId : 'FAILED'}`);
      return success ? trade : null;
    } catch (err) {
      console.error(`[AutoEntry] LIVE error:`, err.message);
      return null;
    }
  }

  // ============ Market Hours Check ============
  function isMarketOpen() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    const day = ist.getUTCDay();
    if (day === 0 || day === 6) return false;
    const h = ist.getUTCHours(), m = ist.getUTCMinutes();
    const mins = h * 60 + m;
    return mins >= 555 && mins <= 930; // 9:15-15:30
  }

  // ============ Auto Square-off Warning ============
  router.post('/api/market/square-off-check', async (req, res) => {
    try {
      const openTrades = (db.data.trades || []).filter(t => t.status === 'OPEN');
      if (openTrades.length === 0) {
        return res.json({ status: 'success', message: 'No open positions', open_count: 0 });
      }

      const totalInvested = openTrades.reduce((s, t) => s + (t.investment || 0), 0);
      const totalPnl = openTrades.reduce((s, t) => s + (t.pnl || 0), 0);

      // Send Telegram warning
      const settings = db.data.settings || {};
      const telegram = settings.telegram || {};
      let telegramSent = false;

      if (telegram.enabled && telegram.bot_token && telegram.chat_id) {
        const message = `*SQUARE-OFF WARNING*

*${openTrades.length} position(s) still OPEN!*
Total Invested: ${Math.round(totalInvested).toLocaleString()}
Unrealized P&L: ${Math.round(totalPnl).toLocaleString()}

Open Positions:
${openTrades.map(t => `- ${t.trade_type} ${t.symbol} | Qty: ${t.quantity} | Entry: ${t.entry_price}`).join('\n')}

_Market closes at 3:30 PM IST. Please square off or the positions may carry over._
_Sent by AI Trading Bot_`;

        try {
          const telegramUrl = `https://api.telegram.org/bot${telegram.bot_token}/sendMessage`;
          await axios.post(telegramUrl, { chat_id: telegram.chat_id, text: message, parse_mode: 'Markdown' }, { timeout: 15000 });
          telegramSent = true;
        } catch (err) {
          console.error('[SquareOff] Telegram error:', err.message);
        }
      }

      // Desktop notification
      if (db.notify) {
        db.notify('exit', 'Square-Off Warning', `${openTrades.length} open position(s) near market close! Total: ${Math.round(totalInvested).toLocaleString()}`);
      }

      res.json({
        status: 'success',
        open_count: openTrades.length,
        total_invested: totalInvested,
        telegram_sent: telegramSent,
        trades: openTrades.map(t => ({ id: t.id, type: t.trade_type, symbol: t.symbol, qty: t.quantity, entry: t.entry_price, investment: t.investment })),
      });
    } catch (err) {
      console.error('[SquareOff] Error:', err.message);
      res.json({ status: 'error', message: err.message });
    }
  });

  // ============ Historical Patterns ============
  router.get('/api/historical-patterns', (req, res) => {
    const patterns = db.data.historical_patterns || [];
    const total = patterns.length;
    const profitable = patterns.filter(p => p.was_profitable).length;

    // Sector-wise stats
    const sectorStats = {};
    for (const p of patterns) {
      const s = p.sector || 'BROAD_MARKET';
      if (!sectorStats[s]) sectorStats[s] = { total: 0, profitable: 0, total_pnl: 0 };
      sectorStats[s].total++;
      if (p.was_profitable) sectorStats[s].profitable++;
      sectorStats[s].total_pnl += p.pnl || 0;
    }

    // Sentiment-wise stats
    const sentimentStats = {};
    for (const p of patterns) {
      const s = p.sentiment || 'NEUTRAL';
      if (!sentimentStats[s]) sentimentStats[s] = { total: 0, profitable: 0, total_pnl: 0 };
      sentimentStats[s].total++;
      if (p.was_profitable) sentimentStats[s].profitable++;
      sentimentStats[s].total_pnl += p.pnl || 0;
    }

    res.json({
      status: 'success',
      total_patterns: total,
      profitable_patterns: profitable,
      win_rate: total ? Math.round((profitable / total) * 1000) / 10 : 0,
      sector_stats: sectorStats,
      sentiment_stats: sentimentStats,
      recent: patterns.slice(-20).reverse(),
    });
  });

  // ============ Tax Report Endpoints ============

  function getFYRange(fyYear) {
    const [startYear] = fyYear.split('-').map(Number);
    return {
      start: new Date(startYear, 3, 1).toISOString(), // April 1
      end: new Date(startYear + 1, 2, 31, 23, 59, 59).toISOString(), // March 31
    };
  }

  function calculateTaxReport(trades, fyYear) {
    // Only use LIVE trades for tax calculation
    const liveTrades = trades.filter(t => (t.mode || 'PAPER') === 'LIVE' && t.status === 'CLOSED');
    const { start, end } = getFYRange(fyYear);
    const fyTrades = liveTrades.filter(t => (t.exit_time || t.entry_time || '') >= start && (t.exit_time || t.entry_time || '') <= end);

    if (!fyTrades.length) return { fy_year: fyYear, total_trades: 0, net_pnl: 0, total_tax_liability: 0, monthly_breakdown: {}, trade_count: 0, message: 'No LIVE trades found for this period. Tax report is based on real broker trades only.' };

    const totalBuy = fyTrades.reduce((s, t) => s + (t.investment || 0), 0);
    const totalSell = fyTrades.reduce((s, t) => s + ((t.exit_price || 0) * (t.quantity || 0)), 0);
    const totalPnl = fyTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    const wins = fyTrades.filter(t => (t.pnl || 0) > 0);
    const losses = fyTrades.filter(t => (t.pnl || 0) < 0);
    const totalProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const turnover = fyTrades.reduce((s, t) => s + Math.abs(t.pnl || 0), 0);
    const sttPaid = totalSell * 0.000625;
    const stcgTax = totalPnl > 0 ? totalPnl * 0.15 : 0;
    const cess = stcgTax * 0.04;

    const monthly = {};
    for (const t of fyTrades) {
      const mk = (t.exit_time || t.entry_time || '').slice(0, 7);
      if (!monthly[mk]) monthly[mk] = { trades: 0, profit: 0, loss: 0, net_pnl: 0, turnover: 0, buy_value: 0, sell_value: 0 };
      const m = monthly[mk];
      m.trades++;
      const p = t.pnl || 0;
      m.net_pnl += p;
      m.turnover += Math.abs(p);
      m.buy_value += t.investment || 0;
      m.sell_value += (t.exit_price || 0) * (t.quantity || 0);
      if (p > 0) m.profit += p; else m.loss += Math.abs(p);
    }
    for (const m of Object.values(monthly)) {
      m.stcg_tax = m.net_pnl > 0 ? Math.round(m.net_pnl * 0.15 * 100) / 100 : 0;
      m.cess = Math.round(m.stcg_tax * 0.04 * 100) / 100;
      m.total_tax = Math.round((m.stcg_tax + m.cess) * 100) / 100;
    }
    const monthlySorted = Object.fromEntries(Object.entries(monthly).sort());

    return {
      fy_year: fyYear, total_trades: fyTrades.length,
      profitable_trades: wins.length, loss_trades: losses.length,
      win_rate: Math.round((wins.length / fyTrades.length) * 1000) / 10,
      total_buy_value: Math.round(totalBuy * 100) / 100,
      total_sell_value: Math.round(totalSell * 100) / 100,
      total_profit: Math.round(totalProfit * 100) / 100,
      total_loss: Math.round(totalLoss * 100) / 100,
      net_pnl: Math.round(totalPnl * 100) / 100,
      turnover: Math.round(turnover * 100) / 100,
      stt_paid: Math.round(sttPaid * 100) / 100,
      stcg_tax: Math.round(stcgTax * 100) / 100,
      cess: Math.round(cess * 100) / 100,
      total_tax_liability: Math.round((stcgTax + cess) * 100) / 100,
      effective_tax_rate: totalPnl > 0 ? Math.round(((stcgTax + cess) / totalPnl) * 1000) / 10 : 0,
      audit_required: turnover > 100000000,
      audit_limit: 100000000,
      monthly_breakdown: monthlySorted,
      trade_count: fyTrades.length,
    };
  }

  router.get('/api/tax/report', (req, res) => {
    const fyYear = req.query.fy_year || '2025-26';
    const report = calculateTaxReport(db.data.trades || [], fyYear);
    res.json({ status: 'success', report });
  });

  router.get('/api/tax/export-excel', (req, res) => {
    // Desktop app: redirect to backend service or return JSON for now
    const fyYear = req.query.fy_year || '2025-26';
    const report = calculateTaxReport(db.data.trades || [], fyYear);
    // For desktop, we generate CSV as a fallback (Excel requires extra deps)
    const headers = 'Month,Trades,Profit,Loss,Net P&L,Turnover,STCG Tax,Cess,Total Tax\n';
    const rows = Object.entries(report.monthly_breakdown).map(([m, d]) => `${m},${d.trades},${d.profit},${d.loss},${d.net_pnl},${d.turnover},${d.stcg_tax},${d.cess},${d.total_tax}`).join('\n');
    const totals = `\nTOTAL,${report.total_trades},${report.total_profit},${report.total_loss},${report.net_pnl},${report.turnover},${report.stcg_tax},${report.cess},${report.total_tax_liability}`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=Tax_Report_FY_${fyYear}.csv`);
    res.send(headers + rows + totals);
  });

  router.get('/api/tax/export-pdf', (req, res) => {
    // Desktop app: return JSON summary (PDF generation needs Python backend)
    const fyYear = req.query.fy_year || '2025-26';
    const report = calculateTaxReport(db.data.trades || [], fyYear);
    res.json({ status: 'success', message: 'PDF export available via web app. Download CSV for desktop.', report });
  });

  // DELETE /api/trades/clear-paper - Clear all paper/demo trades
  router.delete('/api/trades/clear-paper', (req, res) => {
    const before = (db.data.trades || []).length;
    db.data.trades = (db.data.trades || []).filter(t => (t.mode || 'PAPER') === 'LIVE');
    const after = db.data.trades.length;
    // Also clear paper signals
    const sigBefore = (db.data.signals || []).length;
    db.data.signals = (db.data.signals || []).filter(s => (s.mode || 'PAPER') === 'LIVE');
    db.save();
    console.log(`[Trading] Cleared ${before - after} paper trades, ${sigBefore - (db.data.signals || []).length} paper signals`);
    res.json({ status: 'success', message: `Cleared ${before - after} paper trades`, trades_removed: before - after });
  });

  return router;
};
