const { Router } = require('express');

module.exports = function (db) {
  const router = Router();

  function ensurePortfolio() {
    if (!db.data.portfolio || !db.data.portfolio.type) {
      const capital = db.data.settings?.risk?.initial_capital || 500000;
      db.data.portfolio = {
        type: 'paper',
        initial_capital: capital,
        current_capital: capital,
        invested_amount: 0,
        available_capital: capital,
        total_pnl: 0,
        daily_pnl: 0,
        total_trades: 0,
        winning_trades: 0,
        losing_trades: 0,
        active_positions: [],
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      };
      db.save();
    }
    return db.data.portfolio;
  }

  // POST /api/initialize
  router.post('/api/initialize', (req, res) => {
    const p = ensurePortfolio();
    res.json({ status: 'success', message: 'Trading system initialized', capital: p.initial_capital });
  });

  // GET /api/portfolio
  router.get('/api/portfolio', (req, res) => {
    const p = ensurePortfolio();
    const openTrades = (db.data.trades || []).filter(t => t.status === 'OPEN');
    let currentValue = p.available_capital;

    for (const trade of openTrades) {
      const change = (Math.random() - 0.5) * 0.3;
      const curPrice = trade.entry_price * (1 + change);
      currentValue += curPrice * trade.quantity;
    }

    const unrealizedPnl = currentValue - p.initial_capital;

    res.json({
      initial_capital: p.initial_capital,
      current_value: Math.round(currentValue * 100) / 100,
      available_capital: p.available_capital,
      invested_amount: p.invested_amount,
      total_pnl: p.total_pnl,
      unrealized_pnl: Math.round(unrealizedPnl * 100) / 100,
      total_trades: p.total_trades,
      active_positions: openTrades.length,
      winning_trades: p.winning_trades,
      losing_trades: p.losing_trades,
    });
  });

  // GET /api/stats
  router.get('/api/stats', (req, res) => {
    const p = ensurePortfolio();
    const trades = db.data.trades || [];
    const signals = db.data.signals || [];
    const news = db.data.news_articles || [];

    const openTrades = trades.filter(t => t.status === 'OPEN');
    const activeSignals = signals.filter(s => s.status === 'ACTIVE');
    const totalTrades = p.total_trades || 0;
    const winRate = totalTrades > 0 ? (p.winning_trades / totalTrades) * 100 : 0;

    res.json({
      status: 'success',
      stats: {
        total_news_analyzed: news.length,
        total_signals_generated: signals.length,
        active_signals: activeSignals.length,
        total_trades: totalTrades,
        open_trades: openTrades.length,
        portfolio_value: p.available_capital + p.invested_amount,
        total_pnl: p.total_pnl,
        win_rate: Math.round(winRate * 10) / 10,
      },
    });
  });

  // GET /api/combined-status
  router.get('/api/combined-status', async (req, res) => {
    const settings = db.data.settings || {};
    const mode = settings.trading_mode || 'PAPER';

    const result = {
      mode,
      upstox_connected: false,
      market_data: null,
      portfolio: null,
      orders: [],
    };

    if (mode === 'LIVE') {
      const axios = require('axios');
      const token = settings.broker?.access_token;
      if (token) {
        const headers = { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' };
        try {
          const profileRes = await axios.get('https://api.upstox.com/v2/user/profile', { headers, timeout: 10000 });
          if (profileRes.data?.status === 'success') {
            result.upstox_connected = true;
            result.profile = {
              name: profileRes.data.data?.user_name || '',
              email: profileRes.data.data?.email || '',
              user_id: profileRes.data.data?.user_id || '',
              broker: 'Upstox',
            };
          }
        } catch (_) { /* not connected */ }

        if (result.upstox_connected) {
          try {
            const INDEX_KEYS = {
              nifty50: 'NSE_INDEX|Nifty 50',
              sensex: 'BSE_INDEX|SENSEX',
              banknifty: 'NSE_INDEX|Nifty Bank',
              finnifty: 'NSE_INDEX|Nifty Fin Service',
            };
            const keysStr = Object.values(INDEX_KEYS).join(',');
            const mktRes = await axios.get(`https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodeURIComponent(keysStr)}`, { headers, timeout: 10000 });
            if (mktRes.data?.status === 'success') {
              const raw = mktRes.data.data || {};
              const indices = {};
              for (const [key, instrument] of Object.entries(INDEX_KEYS)) {
                const quote = raw[instrument] || {};
                const ltp = quote.last_price || 0;
                const cp = quote.close_price || 0;
                const change = cp ? ltp - cp : 0;
                const changePct = cp ? (change / cp) * 100 : 0;
                indices[key] = { value: ltp, change: Math.round(change * 100) / 100, changePct: Math.round(changePct * 100) / 100 };
              }
              result.market_data = indices;
            }
          } catch (_) {}

          try {
            const [fundsRes, posRes, ordersRes] = await Promise.all([
              axios.get('https://api.upstox.com/v2/user/get-funds-and-margin', { headers, timeout: 10000 }),
              axios.get('https://api.upstox.com/v2/portfolio/short-term-positions', { headers, timeout: 10000 }),
              axios.get('https://api.upstox.com/v2/order/retrieve-all', { headers, timeout: 10000 }),
            ]);

            const equity = fundsRes.data?.data?.equity || {};
            const available = equity.available_margin || 0;
            const used = equity.used_margin || 0;
            const positions = [];
            let totalPnl = 0;
            for (const pos of (posRes.data?.data || [])) {
              const pnl = pos.pnl || pos.realised || 0;
              totalPnl += pnl;
              positions.push({ symbol: pos.trading_symbol || '', quantity: pos.quantity || 0, avg_price: pos.average_price || 0, ltp: pos.last_price || 0, pnl: Math.round(pnl * 100) / 100, product: pos.product || '' });
            }
            result.portfolio = { funds: { available_margin: available, used_margin: used, total: available + used }, positions, total_pnl: Math.round(totalPnl * 100) / 100, active_positions: positions.filter(p => p.quantity !== 0).length };

            const orders = [];
            for (const o of (ordersRes.data?.data || [])) {
              orders.push({ order_id: o.order_id || '', symbol: o.trading_symbol || '', transaction_type: o.transaction_type || '', quantity: o.quantity || 0, price: o.price || 0, average_price: o.average_price || 0, status: o.status || '', order_type: o.order_type || '', product: o.product || '', placed_at: o.order_timestamp || '' });
            }
            result.orders = orders;
          } catch (_) {}
        }
      }
    }

    res.json({ status: 'success', ...result });
  });

  return router;
};
