const { Router } = require('express');
const crypto = require('crypto');

function uuid() { return crypto.randomUUID(); }

module.exports = function (db) {
  const router = Router();

  // Internal state for auto-trading settings
  let autoExitEnabled = true;
  let autoEntryEnabled = false;
  let customTargetPct = null;
  let customStoplossPct = null;

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
    const signals = (db.data.signals || [])
      .slice()
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, limit);
    res.json({ status: 'success', count: signals.length, signals });
  });

  // GET /api/signals/active
  router.get('/api/signals/active', (req, res) => {
    const signals = (db.data.signals || []).filter(s => s.status === 'ACTIVE');
    res.json({ status: 'success', count: signals.length, signals });
  });

  // GET /api/trades/active
  router.get('/api/trades/active', (req, res) => {
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

    const allTrades = (db.data.trades || []).filter(t => (t.entry_time || '') >= todayISO);
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
    const { trade_type, status, date_from, date_to, sort_by, sort_order } = req.query;

    let trades = (db.data.trades || []).slice();

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
  router.post('/api/auto-exit/check', (req, res) => {
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

    for (const trade of openTrades) {
      const change = (Math.random() - 0.5) * 0.3;
      const currentPrice = trade.entry_price * (1 + change);
      const targetPrice = trade.entry_price * (1 + targetPct / 100);
      const stoplossPrice = trade.entry_price * (1 - stoplossPct / 100);

      let shouldExit = false;
      let exitReason = '';

      if (currentPrice >= targetPrice) { shouldExit = true; exitReason = 'TARGET_HIT'; }
      else if (currentPrice <= stoplossPrice) { shouldExit = true; exitReason = 'STOPLOSS_HIT'; }

      if (shouldExit) {
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
              _executePaperTrade(newSignal);
              newTradesCount++;
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
  function _generateSignal(newsDoc) {
    const sentiment = newsDoc.sentiment_analysis || {};
    if (sentiment.confidence < 60 || sentiment.trading_signal === 'HOLD') return null;

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

    return {
      id: uuid(),
      signal_type: signalType,
      symbol: 'NIFTY50',
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
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
  }

  function _executePaperTrade(signal) {
    if (!db.data.trades) db.data.trades = [];
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

  return router;
};
