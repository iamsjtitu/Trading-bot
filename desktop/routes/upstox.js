const { Router } = require('express');
const axios = require('axios');

const UPSTOX_AUTH_URL = 'https://api.upstox.com/v2/login/authorization/dialog';
const UPSTOX_TOKEN_URL = 'https://api.upstox.com/v2/login/authorization/token';
const UPSTOX_API_BASE = 'https://api.upstox.com/v2';

const INDEX_KEYS = {
  nifty50: 'NSE_INDEX|Nifty 50',
  sensex: 'BSE_INDEX|SENSEX',
  banknifty: 'NSE_INDEX|Nifty Bank',
  finnifty: 'NSE_INDEX|Nifty Fin Service',
};

module.exports = function (db) {
  const router = Router();

  function getBroker() {
    return db.data.settings?.broker || {};
  }

  function getToken() {
    return getBroker().access_token || null;
  }

  function apiHeaders(token) {
    return { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' };
  }

  // GET /api/upstox/auth-url
  router.get('/api/upstox/auth-url', (req, res) => {
    const broker = getBroker();
    if (!broker.api_key || !broker.redirect_uri) {
      return res.json({ status: 'error', message: 'API Key and Redirect URI required. Go to Settings > Broker.' });
    }
    const params = new URLSearchParams({ response_type: 'code', client_id: broker.api_key, redirect_uri: broker.redirect_uri });
    res.json({ status: 'success', auth_url: `${UPSTOX_AUTH_URL}?${params}` });
  });

  // POST /api/upstox/callback
  router.post('/api/upstox/callback', async (req, res) => {
    const code = req.body?.code || '';
    if (!code) return res.json({ status: 'error', message: 'Authorization code required' });

    const broker = getBroker();
    if (!broker.api_key || !broker.api_secret || !broker.redirect_uri) {
      return res.json({ status: 'error', message: 'Broker credentials incomplete' });
    }

    try {
      const resp = await axios.post(UPSTOX_TOKEN_URL, new URLSearchParams({
        code, client_id: broker.api_key, client_secret: broker.api_secret,
        redirect_uri: broker.redirect_uri, grant_type: 'authorization_code',
      }).toString(), {
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'Api-Version': '2.0' },
        timeout: 15000,
      });

      if (resp.data?.access_token) {
        if (!db.data.settings.broker) db.data.settings.broker = {};
        db.data.settings.broker.access_token = resp.data.access_token;
        db.data.settings.broker.token_timestamp = new Date().toISOString();
        db.save();
        return res.json({ status: 'success', message: 'Login successful! Access token saved.' });
      }
      const msg = resp.data?.message || resp.data?.error || 'Unknown error';
      res.json({ status: 'error', message: `Token exchange failed: ${msg}` });
    } catch (err) {
      res.json({ status: 'error', message: err.message });
    }
  });

  // GET /api/upstox/connection
  router.get('/api/upstox/connection', async (req, res) => {
    const token = getToken();
    if (!token) return res.json({ connected: false, message: 'No access token. Please login to Upstox.' });

    try {
      const resp = await axios.get(`${UPSTOX_API_BASE}/user/profile`, { headers: apiHeaders(token), timeout: 10000 });
      if (resp.data?.status === 'success') {
        const name = resp.data.data?.user_name || 'Unknown';
        return res.json({ connected: true, message: `Connected as ${name}` });
      }
      res.json({ connected: false, message: 'Token expired. Please re-login.' });
    } catch (err) {
      res.json({ connected: false, message: err.message });
    }
  });

  // GET /api/upstox/profile
  router.get('/api/upstox/profile', async (req, res) => {
    const token = getToken();
    if (!token) return res.json({ status: 'error', message: 'Not logged in' });

    try {
      const resp = await axios.get(`${UPSTOX_API_BASE}/user/profile`, { headers: apiHeaders(token), timeout: 10000 });
      if (resp.data?.status === 'success') {
        const d = resp.data.data || {};
        return res.json({ status: 'success', profile: { name: d.user_name || '', email: d.email || '', user_id: d.user_id || '', broker: d.broker || 'Upstox' } });
      }
      res.json({ status: 'error', message: resp.data?.message || 'Failed' });
    } catch (err) {
      res.json({ status: 'error', message: err.message });
    }
  });

  // GET /api/upstox/market-data
  router.get('/api/upstox/market-data', async (req, res) => {
    const token = getToken();
    if (!token) return res.json({ status: 'error', message: 'Not logged in to Upstox', data: null });

    const keysStr = Object.values(INDEX_KEYS).join(',');
    try {
      const resp = await axios.get(`${UPSTOX_API_BASE}/market-quote/ltp?instrument_key=${encodeURIComponent(keysStr)}`, { headers: apiHeaders(token), timeout: 10000 });
      if (resp.data?.status === 'success') {
        const raw = resp.data.data || {};
        const indices = {};
        for (const [key, instrument] of Object.entries(INDEX_KEYS)) {
          const quote = raw[instrument] || {};
          const ltp = quote.last_price || 0;
          const cp = quote.close_price || 0;
          const change = cp ? ltp - cp : 0;
          const changePct = cp ? (change / cp) * 100 : 0;
          indices[key] = { value: ltp, change: Math.round(change * 100) / 100, changePct: Math.round(changePct * 100) / 100 };
        }
        return res.json({ status: 'success', data: indices });
      }
      res.json({ status: 'error', message: resp.data?.message || 'Failed to fetch market data', data: null });
    } catch (err) {
      res.json({ status: 'error', message: err.message, data: null });
    }
  });

  // GET /api/upstox/portfolio
  router.get('/api/upstox/portfolio', async (req, res) => {
    const token = getToken();
    if (!token) return res.json({ status: 'error', message: 'Not logged in' });

    try {
      const [fundsResp, posResp] = await Promise.all([
        axios.get(`${UPSTOX_API_BASE}/user/get-funds-and-margin`, { headers: apiHeaders(token), timeout: 10000 }),
        axios.get(`${UPSTOX_API_BASE}/portfolio/short-term-positions`, { headers: apiHeaders(token), timeout: 10000 }),
      ]);

      const equity = fundsResp.data?.data?.equity || {};
      const available = equity.available_margin || 0;
      const used = equity.used_margin || 0;

      const positions = [];
      let totalPnl = 0;
      for (const pos of (posResp.data?.data || [])) {
        const pnl = pos.pnl || pos.realised || 0;
        totalPnl += pnl;
        positions.push({
          symbol: pos.trading_symbol || '', quantity: pos.quantity || 0,
          avg_price: pos.average_price || 0, ltp: pos.last_price || 0,
          pnl: Math.round(pnl * 100) / 100, product: pos.product || '',
          instrument_token: pos.instrument_token || '',
        });
      }

      res.json({
        status: 'success',
        funds: { available_margin: available, used_margin: used, total: available + used },
        positions, total_pnl: Math.round(totalPnl * 100) / 100,
        active_positions: positions.filter(p => p.quantity !== 0).length,
      });
    } catch (err) {
      res.json({ status: 'error', message: err.message });
    }
  });

  // POST /api/upstox/order
  router.post('/api/upstox/order', async (req, res) => {
    const token = getToken();
    if (!token) return res.json({ status: 'error', message: 'Not logged in' });

    const params = req.body || {};
    const body = {
      quantity: params.quantity || 1, product: params.product || 'D',
      validity: params.validity || 'DAY', price: params.price || 0,
      instrument_token: params.instrument_token || '', order_type: params.order_type || 'MARKET',
      transaction_type: params.transaction_type || 'BUY', disclosed_quantity: 0,
      trigger_price: params.trigger_price || 0, is_amo: false,
    };

    try {
      const headers = { ...apiHeaders(token), 'Content-Type': 'application/json' };
      const resp = await axios.post(`${UPSTOX_API_BASE}/order/place`, body, { headers, timeout: 15000 });
      if (resp.data?.status === 'success') {
        return res.json({ status: 'success', order_id: resp.data.data?.order_id || '', message: 'Order placed successfully' });
      }
      res.json({ status: 'error', message: resp.data?.message || 'Order failed' });
    } catch (err) {
      res.json({ status: 'error', message: err.message });
    }
  });

  // DELETE /api/upstox/order/:orderId
  router.delete('/api/upstox/order/:orderId', async (req, res) => {
    const token = getToken();
    if (!token) return res.json({ status: 'error', message: 'Not logged in' });

    try {
      const resp = await axios.delete(`${UPSTOX_API_BASE}/order/cancel?order_id=${req.params.orderId}`, { headers: apiHeaders(token), timeout: 10000 });
      res.json({ status: resp.data?.status || 'error', message: resp.data?.message || '' });
    } catch (err) {
      res.json({ status: 'error', message: err.message });
    }
  });

  // GET /api/upstox/orders
  router.get('/api/upstox/orders', async (req, res) => {
    const token = getToken();
    if (!token) return res.json({ status: 'error', message: 'Not logged in', orders: [] });

    try {
      const resp = await axios.get(`${UPSTOX_API_BASE}/order/retrieve-all`, { headers: apiHeaders(token), timeout: 10000 });
      if (resp.data?.status === 'success') {
        const orders = (resp.data.data || []).map(o => ({
          order_id: o.order_id || '', symbol: o.trading_symbol || '',
          transaction_type: o.transaction_type || '', quantity: o.quantity || 0,
          price: o.price || 0, average_price: o.average_price || 0,
          status: o.status || '', order_type: o.order_type || '',
          product: o.product || '', placed_at: o.order_timestamp || '',
        }));
        return res.json({ status: 'success', orders });
      }
      res.json({ status: 'error', message: resp.data?.message || '', orders: [] });
    } catch (err) {
      res.json({ status: 'error', message: err.message, orders: [] });
    }
  });

  // GET /api/upstox/pnl
  router.get('/api/upstox/pnl', async (req, res) => {
    const token = getToken();
    if (!token) return res.json({ status: 'error', message: 'Not logged in', trades: [] });

    const segment = req.query.segment || 'EQ';
    const year = req.query.year || String(new Date().getFullYear());
    const fiscalYear = `${year}-${String(Number(year) + 1).slice(2)}`;

    try {
      const resp = await axios.get(`${UPSTOX_API_BASE}/trade/profit-and-loss/metadata?segment=${segment}&financial_year=${fiscalYear}`, { headers: apiHeaders(token), timeout: 10000 });
      if (resp.data?.status === 'success') {
        return res.json({ status: 'success', data: resp.data.data || {} });
      }
      res.json({ status: 'error', message: resp.data?.message || '', data: {} });
    } catch (err) {
      res.json({ status: 'error', message: err.message, data: {} });
    }
  });

  return router;
};
