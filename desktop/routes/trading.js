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

  // Helper to get active broker token
  function getActiveBrokerToken() {
    const s = db.data?.settings || {};
    const activeBroker = s.active_broker || s.broker?.name || 'upstox';
    return s.broker?.[activeBroker + '_token'] || s.broker?.access_token || '';
  }

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
      const token = getActiveBrokerToken();
      if (!token) {
        return res.json({ status: 'success', count: 0, trades: [], message: 'Upstox not connected' });
      }

      try {
        const headers = { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' };
        const posResp = await axios.get('https://api.upstox.com/v2/portfolio/short-term-positions', { headers, timeout: 10000 });

        if (posResp.data?.status === 'success') {
          const positions = (posResp.data.data || []).filter(p => p.quantity !== 0);

          // Build a lookup of stored trades by instrument_token for SL/target/entry_time
          const storedTradesMap = {};
          for (const t of (db.data.trades || [])) {
            if (t.mode === 'LIVE' && t.status === 'OPEN' && t.instrument_token) {
              storedTradesMap[t.instrument_token] = t;
            }
          }

          const tradesFromPositions = positions.map(pos => {
            // Use buy_price as fallback when average_price is 0
            const entryPrice = pos.average_price || pos.buy_price || (pos.buy_quantity > 0 ? pos.buy_value / pos.buy_quantity : 0);
            const qty = Math.abs(pos.quantity);
            const investment = entryPrice * qty;
            const currentPrice = pos.last_price || 0;
            const currentValue = currentPrice * qty;
            const livePnl = pos.pnl || (currentValue - investment);

            // Merge with stored trade for SL, target, entry_time
            const stored = storedTradesMap[pos.instrument_token] || {};

            // Update stored trade's entry_price with real fill price if it was 0 or a placeholder
            if (stored.id && entryPrice > 0 && (stored.entry_price === 0 || stored.entry_price === 150)) {
              stored.entry_price = entryPrice;
              stored.investment = investment;
              // Recalculate SL/target based on actual entry price
              const rp2 = riskParams[getRiskTolerance()] || riskParams.medium;
              const slPct = customStoplossPct != null ? customStoplossPct : rp2.stop_loss_pct;
              const tgtPct = customTargetPct != null ? customTargetPct : rp2.target_pct;
              stored.stop_loss = Math.round(entryPrice * (1 - slPct / 100) * 100) / 100;
              stored.target = Math.round(entryPrice * (1 + tgtPct / 100) * 100) / 100;
              db.save();
            }

            return {
              id: stored.id || pos.instrument_token,
              trade_type: pos.quantity > 0 ? 'BUY' : 'SELL',
              symbol: pos.trading_symbol || stored.symbol || 'N/A',
              quantity: qty,
              status: 'OPEN',
              entry_price: Math.round(entryPrice * 100) / 100,
              current_price: currentPrice,
              current_value: Math.round(currentValue * 100) / 100,
              investment: Math.round(investment * 100) / 100,
              live_pnl: Math.round(livePnl * 100) / 100,
              pnl_percentage: entryPrice > 0
                ? Math.round(((currentPrice - entryPrice) / entryPrice) * 10000) / 100
                : 0,
              stop_loss: stored.stop_loss || 0,
              target: stored.target || 0,
              entry_time: stored.entry_time || new Date().toISOString(),
              isLive: true,
              instrument_token: pos.instrument_token || '',
              product: pos.product || '',
              signal_id: stored.signal_id || '',
            };
          });
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
    const accessToken = getActiveBrokerToken();

    // LIVE mode: sync entry prices from Upstox positions before checking exit conditions
    if (mode === 'LIVE' && accessToken) {
      try {
        const headers = { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' };
        const posResp = await axios.get('https://api.upstox.com/v2/portfolio/short-term-positions', { headers, timeout: 10000 });
        if (posResp.data?.status === 'success') {
          const posMap = {};
          for (const p of (posResp.data.data || [])) {
            if (p.instrument_token) posMap[p.instrument_token] = p;
          }
          for (const trade of openTrades) {
            if (trade.mode === 'LIVE' && trade.instrument_token && posMap[trade.instrument_token]) {
              const pos = posMap[trade.instrument_token];
              const realEntry = pos.average_price || pos.buy_price || (pos.buy_quantity > 0 ? pos.buy_value / pos.buy_quantity : 0);
              if (realEntry > 0 && (trade.entry_price === 0 || trade.entry_price === 150 || Math.abs(trade.entry_price - realEntry) > realEntry * 0.5)) {
                console.log(`[AutoExit] Updating entry price for ${trade.symbol}: ${trade.entry_price} -> ${realEntry}`);
                trade.entry_price = realEntry;
                trade.investment = realEntry * trade.quantity;
                trade.stop_loss = Math.round(realEntry * (1 - stoplossPct / 100) * 100) / 100;
                trade.target = Math.round(realEntry * (1 + targetPct / 100) * 100) / 100;
              }
            }
          }
          db.save();
        }
      } catch (err) {
        console.error('[AutoExit] Positions sync error:', err.message);
      }
    }

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
              product: 'I',
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


  // POST /api/trades/manual-exit - Manually exit/close a position
  router.post('/api/trades/manual-exit', async (req, res) => {
    const { instrument_token, trade_id } = req.body || {};
    const mode = db.data.settings?.trading_mode || 'PAPER';
    const accessToken = getActiveBrokerToken();

    if (mode === 'LIVE' && accessToken && instrument_token) {
      // LIVE mode: Place SELL order on Upstox
      try {
        // First, get the position details to know quantity
        const headers = { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0', 'Content-Type': 'application/json' };
        const posResp = await axios.get('https://api.upstox.com/v2/portfolio/short-term-positions', {
          headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' },
          timeout: 10000,
        });

        let position = null;
        if (posResp.data?.status === 'success') {
          position = (posResp.data.data || []).find(p => p.instrument_token === instrument_token && p.quantity !== 0);
        }

        if (!position) {
          return res.json({ status: 'error', message: 'Position not found on Upstox. It may have already been closed.' });
        }

        const qty = Math.abs(position.quantity);
        const txnType = position.quantity > 0 ? 'SELL' : 'BUY'; // Reverse the position

        const sellBody = {
          quantity: qty,
          product: 'I',
          validity: 'DAY',
          price: 0,
          instrument_token: instrument_token,
          order_type: 'MARKET',
          transaction_type: txnType,
          disclosed_quantity: 0,
          trigger_price: 0,
          is_amo: false,
        };

        console.log(`[ManualExit] Placing ${txnType} order: ${instrument_token} qty=${qty}`);
        const orderResp = await axios.post('https://api.upstox.com/v2/order/place', sellBody, { headers, timeout: 15000 });
        const orderId = orderResp.data?.data?.order_id || '';
        const orderSuccess = orderResp.data?.status === 'success';

        // Update stored trade
        const storedTrade = (db.data.trades || []).find(t =>
          t.instrument_token === instrument_token && t.status === 'OPEN' && t.mode === 'LIVE'
        );
        if (storedTrade) {
          const exitPrice = position.last_price || 0;
          const entryPrice = position.average_price || position.buy_price || storedTrade.entry_price || 0;
          const pnl = position.pnl || ((exitPrice - entryPrice) * qty);

          storedTrade.status = 'CLOSED';
          storedTrade.exit_time = new Date().toISOString();
          storedTrade.exit_price = exitPrice;
          storedTrade.pnl = Math.round(pnl * 100) / 100;
          storedTrade.pnl_percentage = entryPrice > 0 ? Math.round(((exitPrice - entryPrice) / entryPrice) * 10000) / 100 : 0;
          storedTrade.exit_reason = 'MANUAL_EXIT';
          storedTrade.exit_order_id = orderId;

          // Update portfolio
          const p = db.data.portfolio;
          if (p) {
            p.available_capital = (p.available_capital || 0) + (exitPrice * qty);
            p.invested_amount = Math.max(0, (p.invested_amount || 0) - storedTrade.investment);
            p.total_pnl = (p.total_pnl || 0) + pnl;
            p.total_trades = (p.total_trades || 0) + 1;
            if (pnl > 0) p.winning_trades = (p.winning_trades || 0) + 1;
            else p.losing_trades = (p.losing_trades || 0) + 1;
            p.last_updated = new Date().toISOString();
          }
          db.save();
        }

        if (db.notify) db.notify('exit', 'Manual Exit', `${instrument_token} | Qty: ${qty} | ${orderSuccess ? 'Order: ' + orderId : 'FAILED'}`);

        return res.json({
          status: orderSuccess ? 'success' : 'error',
          message: orderSuccess ? `Exit order placed. Order ID: ${orderId}` : 'Exit order failed',
          order_id: orderId,
        });
      } catch (err) {
        const upstoxErr = err.response?.data?.message || err.response?.data?.errors?.[0]?.message || err.message;
        console.error(`[ManualExit] Error: ${upstoxErr}`);
        return res.json({ status: 'error', message: `Exit failed: ${upstoxErr}` });
      }
    }

    // PAPER mode: close the trade locally
    const trade = (db.data.trades || []).find(t =>
      (trade_id ? t.id === trade_id : t.instrument_token === instrument_token) && t.status === 'OPEN'
    );
    if (!trade) {
      return res.json({ status: 'error', message: 'Trade not found' });
    }

    const exitPrice = trade.current_price || trade.entry_price * (1 + (Math.random() - 0.5) * 0.1);
    const pnl = (exitPrice - trade.entry_price) * trade.quantity;
    trade.status = 'CLOSED';
    trade.exit_time = new Date().toISOString();
    trade.exit_price = Math.round(exitPrice * 100) / 100;
    trade.pnl = Math.round(pnl * 100) / 100;
    trade.pnl_percentage = trade.entry_price > 0 ? Math.round(((exitPrice - trade.entry_price) / trade.entry_price) * 10000) / 100 : 0;
    trade.exit_reason = 'MANUAL_EXIT';

    const p = db.data.portfolio;
    if (p) {
      p.available_capital = (p.available_capital || 0) + (exitPrice * trade.quantity);
      p.invested_amount = Math.max(0, (p.invested_amount || 0) - trade.investment);
      p.total_pnl = (p.total_pnl || 0) + pnl;
      p.total_trades = (p.total_trades || 0) + 1;
      if (pnl > 0) p.winning_trades = (p.winning_trades || 0) + 1;
      else p.losing_trades = (p.losing_trades || 0) + 1;
      p.last_updated = new Date().toISOString();
    }
    db.save();

    if (db.notify) db.notify('exit', 'Manual Exit', `${trade.symbol} | P&L: ${Math.round(pnl)}`);

    return res.json({ status: 'success', message: `Trade closed. P&L: ${Math.round(pnl * 100) / 100}` });
  });

  // POST /api/trades/execute-signal - Execute a trade from an existing signal
  router.post('/api/trades/execute-signal', async (req, res) => {
    const { signal_id } = req.body || {};
    const mode = db.data.settings?.trading_mode || 'PAPER';

    // Find the signal (by ID or use latest untraded)
    let signal;
    if (signal_id) {
      signal = (db.data.signals || []).find(s => s.id === signal_id);
    } else {
      // Find latest ACTIVE signal that doesn't have an OPEN trade
      const tradedSignalIds = new Set((db.data.trades || []).filter(t => t.status === 'OPEN').map(t => t.signal_id));
      signal = (db.data.signals || [])
        .filter(s => s.status === 'ACTIVE' && !tradedSignalIds.has(s.id))
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
    }

    if (!signal) {
      return res.json({ status: 'error', message: 'No active untraded signal found' });
    }

    if (mode === 'LIVE') {
      const token = getActiveBrokerToken();
      if (!token) {
        return res.json({ status: 'error', message: 'Broker not connected. Cannot execute LIVE trade.' });
      }
      console.log(`[ExecuteSignal] Executing LIVE trade for signal ${signal.id}: ${signal.signal_type} ${signal.symbol}`);
      const result = await executeLiveAutoEntry(signal, token);
      if (result) {
        return res.json({ status: 'success', trade: result, message: 'LIVE trade placed on Upstox' });
      }
      return res.json({ status: 'error', message: 'Trade execution failed. Check trade history for details.' });
    } else {
      _executePaperTrade(signal);
      return res.json({ status: 'success', message: 'Paper trade executed' });
    }
  });

  // GET /api/trades/log - Show ALL trades including FAILED ones (for debugging)
  router.get('/api/trades/log', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const mode = db.data.settings?.trading_mode || 'PAPER';
    const allTrades = (db.data.trades || [])
      .filter(t => (t.mode || 'PAPER') === mode)
      .slice(-limit)
      .reverse();
    const failed = allTrades.filter(t => t.status === 'FAILED');
    const open = allTrades.filter(t => t.status === 'OPEN');
    const closed = allTrades.filter(t => t.status === 'CLOSED');
    res.json({
      status: 'success',
      total: allTrades.length,
      open: open.length,
      closed: closed.length,
      failed: failed.length,
      trades: allTrades,
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

  // GET /api/debug/auto-trade-test - Simulate entire auto-trade flow, return each step
  router.get('/api/debug/auto-trade-test', async (req, res) => {
    const steps = [];
    const settings = db.data?.settings || {};

    // Step 1: Check trading mode
    const mode = settings.trading_mode || 'PAPER';
    steps.push({ step: 1, name: 'Trading Mode', value: mode, ok: mode === 'LIVE' });

    // Step 2: Check auto-entry
    const autoEntry = settings.auto_trading?.auto_entry || false;
    steps.push({ step: 2, name: 'Auto-Entry Enabled', value: autoEntry, ok: autoEntry === true });

    // Step 3: Check broker token
    const activeBroker = settings.active_broker || settings.broker?.name || 'upstox';
    const token = settings.broker?.[`${activeBroker}_token`] || settings.broker?.access_token || null;
    steps.push({ step: 3, name: 'Broker Token', value: token ? `Found (${activeBroker}: ${token.substring(0, 12)}...)` : 'MISSING', ok: !!token });

    // Step 4: Check active instrument
    const inst = settings.trading_instrument || 'NIFTY50';
    steps.push({ step: 4, name: 'Active Instrument', value: inst, ok: true });

    // Step 5: Check signals
    const activeSignals = (db.data.signals || []).filter(s => s.status === 'ACTIVE');
    const tradedSignalIds = new Set((db.data.trades || []).filter(t => t.status === 'OPEN').map(t => t.signal_id));
    const untradedSignals = activeSignals.filter(s => !tradedSignalIds.has(s.id));
    steps.push({ step: 5, name: 'Active Signals', value: `${activeSignals.length} total, ${untradedSignals.length} untraded`, ok: untradedSignals.length > 0 });

    // Step 6: Try fetching nearest expiry from Upstox
    let expiryStr = '';
    if (token) {
      const instKeyMap = {
        'NIFTY50': 'NSE_INDEX|Nifty 50', 'BANKNIFTY': 'NSE_INDEX|Nifty Bank',
        'FINNIFTY': 'NSE_INDEX|Nifty Fin Service', 'MIDCPNIFTY': 'NSE_INDEX|NIFTY MID SELECT',
        'SENSEX': 'BSE_INDEX|SENSEX', 'BANKEX': 'BSE_INDEX|BANKEX',
      };
      const instKey = instKeyMap[inst] || 'NSE_INDEX|Nifty 50';
      try {
        const contractResp = await axios.get('https://api.upstox.com/v2/option/contract', {
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' },
          params: { instrument_key: instKey },
          timeout: 10000,
        });
        if (contractResp.data?.status === 'success' && contractResp.data?.data?.length > 0) {
          const todayStr = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().substring(0, 10);
          const expirySet = new Set();
          let debugLotSize = 0;
          for (const c of contractResp.data.data) {
            const exp = (c.expiry || '').substring(0, 10);
            if (exp && exp >= todayStr) expirySet.add(exp);
            if (!debugLotSize && c.lot_size > 0) debugLotSize = c.lot_size;
          }
          const sorted = [...expirySet].sort();
          const fallbackLotSizeMap = { NIFTY50: 65, BANKNIFTY: 30, FINNIFTY: 60, MIDCPNIFTY: 120, SENSEX: 20, BANKEX: 30 };
          const effectiveLotSize = debugLotSize || fallbackLotSizeMap[inst] || 65;
          if (sorted.length > 0) {
            expiryStr = sorted[0]; // NEAREST expiry
            steps.push({ step: 6, name: 'Nearest Expiry (from Upstox API)', value: expiryStr, ok: true, all_expiries: sorted.slice(0, 10), contracts_count: contractResp.data.data.length, lot_size_from_api: debugLotSize, effective_lot_size: effectiveLotSize });
          } else {
            steps.push({ step: 6, name: 'Nearest Expiry', value: 'No future expiries found', ok: false });
          }
        } else {
          steps.push({ step: 6, name: 'Nearest Expiry', value: `API returned: ${contractResp.data?.message || 'empty data'}`, ok: false });
        }
      } catch (e) {
        const errMsg = e.response?.data?.message || e.message;
        steps.push({ step: 6, name: 'Nearest Expiry', value: `API ERROR: ${errMsg}`, ok: false });
      }
    } else {
      steps.push({ step: 6, name: 'Nearest Expiry', value: 'Skipped (no token)', ok: false });
    }

    // Step 7: Try fetching option chain
    if (token && expiryStr) {
      const instKeyMap = {
        'NIFTY50': 'NSE_INDEX|Nifty 50', 'BANKNIFTY': 'NSE_INDEX|Nifty Bank',
        'FINNIFTY': 'NSE_INDEX|Nifty Fin Service', 'MIDCPNIFTY': 'NSE_INDEX|NIFTY MID SELECT',
        'SENSEX': 'BSE_INDEX|SENSEX', 'BANKEX': 'BSE_INDEX|BANKEX',
      };
      try {
        const ocResp = await axios.get('https://api.upstox.com/v2/option/chain', {
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' },
          params: { instrument_key: instKeyMap[inst] || 'NSE_INDEX|Nifty 50', expiry_date: expiryStr },
          timeout: 15000,
        });
        if (ocResp.data?.status === 'success' && ocResp.data?.data?.length > 0) {
          const strikes = ocResp.data.data.map(i => i.strike_price).sort((a, b) => a - b);
          const sampleItem = ocResp.data.data[0];
          const hasCallKey = !!sampleItem?.call_options?.instrument_key;
          const hasPutKey = !!sampleItem?.put_options?.instrument_key;
          steps.push({
            step: 7, name: 'Option Chain Data', ok: true,
            value: `${ocResp.data.data.length} strikes (${strikes[0]}-${strikes[strikes.length - 1]})`,
            has_call_instrument_key: hasCallKey,
            has_put_instrument_key: hasPutKey,
            sample_call_key: sampleItem?.call_options?.instrument_key || 'MISSING',
            sample_put_key: sampleItem?.put_options?.instrument_key || 'MISSING',
          });
        } else {
          steps.push({ step: 7, name: 'Option Chain Data', value: `Empty or error: ${ocResp.data?.message || 'no data'}`, ok: false });
        }
      } catch (e) {
        steps.push({ step: 7, name: 'Option Chain Data', value: `ERROR: ${e.response?.data?.message || e.message}`, ok: false });
      }
    } else {
      steps.push({ step: 7, name: 'Option Chain Data', value: 'Skipped', ok: false });
    }

    // Step 8: Check recent trades including failed
    const recentTrades = (db.data.trades || []).filter(t => t.mode === 'LIVE').slice(-5).reverse();
    const failedTrades = recentTrades.filter(t => t.status === 'FAILED');
    steps.push({
      step: 8, name: 'Recent LIVE Trades', ok: recentTrades.length > 0,
      value: `${recentTrades.length} total, ${failedTrades.length} failed`,
      trades: recentTrades.map(t => ({ id: t.id?.substring(0, 8), status: t.status, type: t.trade_type, symbol: t.symbol, error: t.error || '', time: t.entry_time })),
    });

    const allOk = steps.every(s => s.ok);
    res.json({ status: 'success', all_ok: allOk, version: '3.2.0', steps });
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
    const activeInstrument = db.data?.settings?.trading_instrument || db.data?.settings?.active_instrument || 'NIFTY50';
    if (!_isMarketOpen(activeInstrument)) {
      console.log('[Signal] Market closed, skipping signal generation');
      return null;
    }

    const signalType = sentiment.trading_signal === 'BUY_CALL' ? 'CALL' : 'PUT';

    // DUPLICATE TRADE PROTECTION: Skip if same type OPEN trade exists IN CURRENT MODE
    const currentMode = db.data?.settings?.trading_mode || 'PAPER';
    const existingOpen = (db.data.trades || []).find(t =>
      t.status === 'OPEN' && t.trade_type === signalType && t.symbol === activeInstrument && t.mode === currentMode
    );
    if (existingOpen) {
      console.log(`[Signal] Skipping ${signalType} ${activeInstrument} - already have OPEN ${currentMode} position (${existingOpen.id?.substring(0, 8)})`);
      return null;
    }

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

    // Get actual spot price from latest market data or use instrument default
    const INST_CONFIG = {
      NIFTY50: { base_price: 24000, strike_step: 50 },
      BANKNIFTY: { base_price: 52000, strike_step: 100 },
      FINNIFTY: { base_price: 23800, strike_step: 50 },
      MIDCPNIFTY: { base_price: 12000, strike_step: 25 },
      SENSEX: { base_price: 79800, strike_step: 100 },
      BANKEX: { base_price: 55000, strike_step: 100 },
    };
    const instCfg = INST_CONFIG[activeInstrument] || INST_CONFIG.NIFTY50;
    let spotPrice = instCfg.base_price;
    if (db.data.market_data?.indices) {
      const key = activeInstrument.toLowerCase();
      const idx = db.data.market_data.indices[key];
      if (idx?.value > 0) spotPrice = idx.value;
    }
    const strikeStep = instCfg.strike_step || 50;
    const atmStrike = Math.round(spotPrice / strikeStep) * strikeStep;
    const strikeOffset = signalType === 'CALL' ? strikeStep * 2 : -(strikeStep * 2);

    return {
      id: uuid(),
      signal_type: signalType,
      symbol: activeInstrument,
      strike_price: atmStrike + strikeOffset,
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
      const activeInst = signal.symbol || 'NIFTY50';

      // DUPLICATE TRADE PROTECTION: Skip if same type OPEN trade exists IN CURRENT MODE
      const existingOpen = (db.data.trades || []).find(t =>
        t.status === 'OPEN' && t.trade_type === signal.signal_type && t.symbol === activeInst && t.mode === 'LIVE'
      );
      if (existingOpen) {
        console.log(`[AutoEntry] Skipping ${signal.signal_type} ${activeInst} - already have OPEN LIVE position`);
        return null;
      }

      // Map instrument to Upstox key
      const instKeyMap = {
        'NIFTY50': 'NSE_INDEX|Nifty 50', 'BANKNIFTY': 'NSE_INDEX|Nifty Bank',
        'FINNIFTY': 'NSE_INDEX|Nifty Fin Service', 'MIDCPNIFTY': 'NSE_INDEX|NIFTY MID SELECT',
        'SENSEX': 'BSE_INDEX|SENSEX', 'BANKEX': 'BSE_INDEX|BANKEX',
      };
      const instKey = instKeyMap[activeInst] || 'NSE_INDEX|Nifty 50';

      // Get nearest valid expiry from Upstox API
      let expiryStr = '';
      let apiLotSize = 0;
      try {
        const contractResp = await axios.get('https://api.upstox.com/v2/option/contract', {
          headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' },
          params: { instrument_key: instKey },
          timeout: 10000,
        });
        if (contractResp.data?.status === 'success' && contractResp.data?.data?.length > 0) {
          const todayStr = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().substring(0, 10);
          const expirySet = new Set();
          for (const c of contractResp.data.data) {
            const exp = (c.expiry || '').substring(0, 10);
            if (exp && exp >= todayStr) expirySet.add(exp);
            if (!apiLotSize && c.lot_size > 0) apiLotSize = c.lot_size;
          }
          const sorted = [...expirySet].sort();
          if (sorted.length > 0) expiryStr = sorted[0]; // NEAREST expiry
          console.log(`[AutoEntry] Nearest expiry: ${expiryStr} (from ${sorted.length} available), lot_size from API: ${apiLotSize}`);
        }
      } catch (e) { console.error(`[AutoEntry] Expiry fetch failed: ${e.message}`); }
      if (!expiryStr) {
        // Fallback: calculate next Tuesday (NSE post-Aug 2025)
        const now = new Date(); const istOffset = 5.5 * 60 * 60 * 1000;
        const ist = new Date(now.getTime() + istOffset);
        let daysToAdd = 2 - ist.getUTCDay();
        if (daysToAdd < 0) daysToAdd += 7;
        if (daysToAdd === 0 && (ist.getUTCHours() * 60 + ist.getUTCMinutes()) > 930) daysToAdd = 7;
        const expiryDate = new Date(ist.getTime() + daysToAdd * 86400000);
        expiryStr = `${expiryDate.getUTCFullYear()}-${String(expiryDate.getUTCMonth() + 1).padStart(2, '0')}-${String(expiryDate.getUTCDate()).padStart(2, '0')}`;
      }

      console.log(`[AutoEntry] Looking up option chain: ${instKey} expiry=${expiryStr} strike=${signal.strike_price} ${optionType}`);

      // Try to find instrument from option chain
      let instrumentToken = null;
      try {
        const ocResp = await axios.get('https://api.upstox.com/v2/option/chain', {
          headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' },
          params: { instrument_key: instKey, expiry_date: expiryStr },
          timeout: 15000,
        });
        if (ocResp.data?.status === 'success' && ocResp.data?.data) {
          let minDiff = Infinity;
          for (const item of ocResp.data.data) {
            const opt = optionType === 'CE' ? item.call_options : item.put_options;
            if (opt?.instrument_key) {
              const diff = Math.abs((item.strike_price || 0) - signal.strike_price);
              if (diff < minDiff) { minDiff = diff; instrumentToken = opt.instrument_key; }
            }
          }
        }
      } catch (ocErr) {
        console.error(`[AutoEntry] Option chain lookup failed: ${ocErr.response?.data?.message || ocErr.message}`);
      }

      if (!instrumentToken) {
        // Fallback: construct instrument token using expiry string
        const [eY, eM, eD] = expiryStr.split('-');
        const optSymbolMap = { NIFTY50: 'NIFTY', BANKNIFTY: 'BANKNIFTY', FINNIFTY: 'FINNIFTY', MIDCPNIFTY: 'MIDCPNIFTY', SENSEX: 'SENSEX', BANKEX: 'BANKEX' };
        const exchangeMap = { NIFTY50: 'NSE_FO', BANKNIFTY: 'NSE_FO', FINNIFTY: 'NSE_FO', MIDCPNIFTY: 'NSE_FO', SENSEX: 'BFO', BANKEX: 'BFO' };
        const optSymbol = optSymbolMap[activeInst] || 'NIFTY';
        const exchange = exchangeMap[activeInst] || 'NSE_FO';
        instrumentToken = `${exchange}|${optSymbol}${eY.slice(2)}${eM}${eD}${signal.strike_price}${optionType}`;
        console.log(`[AutoEntry] Using constructed instrument: ${instrumentToken}`);
      }

      // Ensure quantity is a multiple of lot size (fetch from API first, fallback to updated Jan 2026 values)
      const lotSizeMap = { NIFTY50: 65, BANKNIFTY: 30, FINNIFTY: 60, MIDCPNIFTY: 120, SENSEX: 20, BANKEX: 30 };
      const lotSize = apiLotSize || lotSizeMap[activeInst] || 65;
      const qty = Math.max(lotSize, Math.round(signal.quantity / lotSize) * lotSize);

      const orderBody = {
        quantity: qty, product: 'I', validity: 'DAY', price: 0,
        instrument_token: instrumentToken, order_type: 'MARKET', transaction_type: 'BUY',
        disclosed_quantity: 0, trigger_price: 0, is_amo: false,
      };

      console.log(`[AutoEntry] Placing ${signal.signal_type} order: ${instrumentToken} qty=${qty} product=I`);
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
      const upstoxErr = err.response?.data?.message || err.response?.data?.errors?.[0]?.message || err.message;
      const errStatus = err.response?.status || 'unknown';
      console.error(`[AutoEntry] LIVE error ${errStatus}: ${upstoxErr}`);
      console.error(`[AutoEntry] Full error data:`, JSON.stringify(err.response?.data || {}));
      // Save failed trade for tracking
      if (!db.data.trades) db.data.trades = [];
      db.data.trades.push({
        id: crypto.randomUUID(), signal_id: signal.id, trade_type: signal.signal_type,
        symbol: signal.symbol, entry_time: new Date().toISOString(),
        entry_price: signal.entry_price, quantity: signal.quantity,
        investment: signal.investment_amount, status: 'FAILED',
        mode: 'LIVE', error: `${errStatus}: ${upstoxErr}`,
        exit_time: null, exit_price: null, pnl: 0, pnl_percentage: 0,
      });
      db.save();
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
