/**
 * Missing API Routes for Desktop App
 * Fills the gap between Python backend features and Node.js desktop backend
 * Includes: market-data/quick, auto-entry/status, instruments, brokers, option-chain, ws status
 */
const { Router } = require('express');
const axios = require('axios');
const crypto = require('crypto');

const { getMCXKeys } = require('./mcx_resolver');

const INDEX_KEYS = {
  nifty50: 'NSE_INDEX|Nifty 50',
  sensex: 'BSE_INDEX|SENSEX',
  banknifty: 'NSE_INDEX|Nifty Bank',
  finnifty: 'NSE_INDEX|Nifty Fin Service',
};

const INSTRUMENTS = {
  NIFTY50: { label: 'Nifty 50 (NSE)', exchange: 'NSE', symbol: 'NIFTY', lot_size: 25, tick_size: 0.05, strike_step: 50, option_premium: '~200' },
  BANKNIFTY: { label: 'Bank Nifty (NSE)', exchange: 'NSE', symbol: 'BANKNIFTY', lot_size: 15, tick_size: 0.05, strike_step: 100, option_premium: '~300' },
  FINNIFTY: { label: 'Fin Nifty (NSE)', exchange: 'NSE', symbol: 'FINNIFTY', lot_size: 25, tick_size: 0.05, strike_step: 50, option_premium: '~150' },
  MIDCPNIFTY: { label: 'Midcap Nifty (NSE)', exchange: 'NSE', symbol: 'MIDCPNIFTY', lot_size: 50, tick_size: 0.05, strike_step: 25, option_premium: '~100' },
  SENSEX: { label: 'Sensex (BSE)', exchange: 'BSE', symbol: 'SENSEX', lot_size: 10, tick_size: 0.05, strike_step: 100, option_premium: '~250' },
  BANKEX: { label: 'Bankex (BSE)', exchange: 'BSE', symbol: 'BANKEX', lot_size: 15, tick_size: 0.05, strike_step: 100, option_premium: '~200' },
  CRUDEOIL: { label: 'Crude Oil (MCX)', exchange: 'MCX', symbol: 'CRUDEOIL', lot_size: 100, tick_size: 1, strike_step: 50, option_premium: '~50' },
  GOLD: { label: 'Gold (MCX)', exchange: 'MCX', symbol: 'GOLD', lot_size: 100, tick_size: 1, strike_step: 100, option_premium: '~500' },
  SILVER: { label: 'Silver (MCX)', exchange: 'MCX', symbol: 'SILVER', lot_size: 30, tick_size: 1, strike_step: 500, option_premium: '~300' },
};

const BROKER_INFO = {
  upstox: { id: 'upstox', name: 'Upstox', description: 'Full API support with WebSocket', status: 'active', features: ['options', 'futures', 'websocket'] },
  zerodha: { id: 'zerodha', name: 'Zerodha', description: 'Coming soon - Kite Connect API', status: 'coming_soon', features: ['options', 'futures'] },
  angelone: { id: 'angelone', name: 'Angel One', description: 'Coming soon - SmartAPI', status: 'coming_soon', features: ['options', 'futures'] },
  '5paisa': { id: '5paisa', name: '5paisa', description: 'Coming soon - 5paisa API', status: 'coming_soon', features: ['options', 'futures'] },
  paytmmoney: { id: 'paytmmoney', name: 'Paytm Money', description: 'Coming soon - Paytm Money API', status: 'coming_soon', features: ['options'] },
  iifl: { id: 'iifl', name: 'IIFL Securities', description: 'Coming soon - IIFL Markets API', status: 'coming_soon', features: ['options', 'futures'] },
};

module.exports = function (db) {
  const router = Router();

  function getToken() {
    const activeBroker = db.data.settings?.broker?.name || 'upstox';
    return db.data.settings?.broker?.[`${activeBroker}_token`] || null;
  }

  function apiHeaders(token) {
    return { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' };
  }

  // ==================== Market Data Quick ====================
  router.get('/api/market-data/quick', async (req, res) => {
    const token = getToken();
    if (!token) {
      return res.json({ status: 'success', data: null, source: 'none' });
    }
    try {
      // Resolve MCX keys dynamically
      const mcxKeys = await getMCXKeys();
      const allKeys = { ...INDEX_KEYS, ...mcxKeys };
      const keysStr = Object.values(allKeys).join(',');
      const resp = await axios.get(`https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(keysStr)}`, {
        headers: apiHeaders(token), timeout: 5000,
      });
      if (resp.data?.status === 'success') {
        const raw = resp.data.data || {};
        const indices = {};
        for (const [key, instrument] of Object.entries(allKeys)) {
          let quote = raw[instrument];
          if (!quote) {
            const matchKey = Object.keys(raw).find(k => k.includes(instrument.split('|')[1] || ''));
            if (matchKey) quote = raw[matchKey];
          }
          if (!quote) { indices[key] = { value: 0, change: 0, changePct: 0 }; continue; }
          const ltp = quote.last_price || 0;
          const netChange = quote.net_change || 0;
          const prevClose = ltp - netChange;
          const changePct = prevClose > 0 ? (netChange / prevClose) * 100 : 0;
          indices[key] = { value: ltp, change: Math.round(netChange * 100) / 100, changePct: Math.round(changePct * 100) / 100 };
        }
        return res.json({ status: 'success', data: indices, source: 'rest', ts: new Date().toISOString() });
      }
    } catch (e) {
      console.log('[QuickData] Error:', e.message);
    }
    res.json({ status: 'success', data: null, source: 'none' });
  });

  // ==================== Auto-Entry Status ====================
  router.get('/api/auto-entry/status', (req, res) => {
    const settings = db.data.settings || {};
    const autoTrading = settings.auto_trading || {};
    const token = getToken();
    res.json({
      status: 'success',
      auto_entry_enabled: autoTrading.auto_entry || false,
      auto_exit_enabled: autoTrading.auto_exit !== false,
      trading_mode: settings.trading_mode || 'PAPER',
      active_instrument: settings.trading_instrument || 'NIFTY50',
      broker_connected: !!token,
      live_open_orders: 0,
      signals_last_hour: (db.data.signals || []).filter(s => {
        const created = new Date(s.created_at || 0).getTime();
        return Date.now() - created < 3600000;
      }).length,
    });
  });

  // ==================== Instruments ====================
  router.get('/api/instruments', (req, res) => {
    const active = db.data.settings?.trading_instrument || 'NIFTY50';
    res.json({
      status: 'success',
      instruments: Object.fromEntries(Object.entries(INSTRUMENTS).map(([k, v]) => [k, v.label])),
      active,
      details: INSTRUMENTS,
    });
  });

  router.post('/api/instruments/set', (req, res) => {
    const instrument = req.body?.instrument || '';
    if (!INSTRUMENTS[instrument]) {
      return res.json({ status: 'error', message: `Unknown instrument: ${instrument}` });
    }
    if (!db.data.settings) db.data.settings = {};
    db.data.settings.trading_instrument = instrument;
    db.save();
    res.json({ status: 'success', active: instrument, details: INSTRUMENTS[instrument] });
  });

  // ==================== Broker Management ====================
  router.get('/api/brokers/list', (req, res) => {
    const activeBroker = db.data.settings?.broker?.name || 'upstox';
    res.json({ status: 'success', brokers: Object.values(BROKER_INFO), active: activeBroker });
  });

  router.post('/api/brokers/set-active', (req, res) => {
    const brokerId = req.body?.broker_id || 'upstox';
    if (!BROKER_INFO[brokerId]) {
      return res.json({ status: 'error', message: `Unknown broker: ${brokerId}` });
    }
    if (!db.data.settings) db.data.settings = {};
    if (!db.data.settings.broker) db.data.settings.broker = {};
    db.data.settings.broker.name = brokerId;
    db.save();
    res.json({ status: 'success', active: brokerId, broker: BROKER_INFO[brokerId] });
  });

  router.get('/api/brokers/active', (req, res) => {
    const activeBroker = db.data.settings?.broker?.name || 'upstox';
    res.json({ status: 'success', broker_id: activeBroker, broker: BROKER_INFO[activeBroker] || BROKER_INFO.upstox });
  });

  router.get('/api/brokers/connection', async (req, res) => {
    const token = getToken();
    if (!token) return res.json({ connected: false, message: 'No access token. Please login.' });
    try {
      const resp = await axios.get('https://api.upstox.com/v2/user/profile', { headers: apiHeaders(token), timeout: 10000 });
      if (resp.data?.status === 'success') {
        return res.json({ connected: true, message: `Connected as ${resp.data.data?.user_name || 'User'}` });
      }
      res.json({ connected: false, message: 'Token expired' });
    } catch (e) {
      res.json({ connected: false, message: e.message });
    }
  });

  // ==================== Option Chain ====================
  router.get('/api/option-chain/instruments', (req, res) => {
    const instruments = {};
    for (const [key, val] of Object.entries(INSTRUMENTS)) {
      instruments[key] = {
        label: val.label, name: val.label.split(' (')[0], exchange: val.exchange,
        symbol: val.symbol, lot_size: val.lot_size, type: val.exchange === 'MCX' ? 'commodity' : 'index',
      };
    }
    res.json({ status: 'success', instruments });
  });

  router.get('/api/option-chain/:instrument', async (req, res) => {
    const instrument = req.params.instrument;
    const spotPrice = parseFloat(req.query.spot_price) || 0;
    const strikes = parseInt(req.query.strikes) || 15;
    const expiryDays = parseInt(req.query.expiry_days) || 7;

    const instConfig = INSTRUMENTS[instrument] || INSTRUMENTS.NIFTY50;
    const spot = spotPrice || getDefaultSpot(instrument);
    const strikeStep = getStrikeStep(instrument, spot);
    const atmStrike = Math.round(spot / strikeStep) * strikeStep;

    // Generate simulated option chain using Black-Scholes
    const chain = [];
    for (let i = -strikes; i <= strikes; i++) {
      const strike = atmStrike + i * strikeStep;
      const iv = 15 + Math.random() * 10;
      const t = expiryDays / 365;
      const r = 0.07;

      const cePrice = blackScholesCall(spot, strike, t, r, iv / 100);
      const pePrice = blackScholesPut(spot, strike, t, r, iv / 100);
      const ceOI = Math.floor(Math.random() * 5000000) + 100000;
      const peOI = Math.floor(Math.random() * 5000000) + 100000;

      chain.push({
        strike,
        ce: { price: Math.round(cePrice * 100) / 100, oi: ceOI, volume: Math.floor(ceOI * 0.3), iv: Math.round(iv * 100) / 100, delta: calcDelta(spot, strike, t, r, iv / 100, 'CE'), gamma: 0.001, theta: -cePrice * 0.01, vega: cePrice * 0.05 },
        pe: { price: Math.round(pePrice * 100) / 100, oi: peOI, volume: Math.floor(peOI * 0.3), iv: Math.round(iv * 100) / 100, delta: calcDelta(spot, strike, t, r, iv / 100, 'PE'), gamma: 0.001, theta: -pePrice * 0.01, vega: pePrice * 0.05 },
      });
    }

    const totalCeOI = chain.reduce((s, c) => s + c.ce.oi, 0);
    const totalPeOI = chain.reduce((s, c) => s + c.pe.oi, 0);
    const pcr = totalCeOI > 0 ? Math.round((totalPeOI / totalCeOI) * 100) / 100 : 1;
    const maxPainStrike = chain.reduce((best, c) => (c.ce.oi + c.pe.oi) > (best.ce.oi + best.pe.oi) ? c : best, chain[0]).strike;

    res.json({
      status: 'success',
      instrument, spot_price: spot, atm_strike: atmStrike,
      expiry_days: expiryDays, chain, pcr, max_pain: maxPainStrike,
      is_simulated: true, source: 'black_scholes',
    });
  });

  router.get('/api/oi-buildup-alerts', (req, res) => {
    res.json({ status: 'success', alerts: [], message: 'OI buildup alerts require live data connection' });
  });

  // ==================== WebSocket Status ====================
  router.get('/api/ws/status', (req, res) => {
    res.json({ status: 'success', is_connected: false, clients: 0, message: 'WebSocket available in web mode' });
  });

  // ==================== Helpers ====================
  function getDefaultSpot(instrument) {
    const defaults = { NIFTY50: 24000, BANKNIFTY: 52000, FINNIFTY: 23800, MIDCPNIFTY: 12500, SENSEX: 79500, BANKEX: 57000, CRUDEOIL: 5800, GOLD: 72000, SILVER: 85000 };
    return defaults[instrument] || 24000;
  }

  function getStrikeStep(instrument, spot) {
    if (['CRUDEOIL', 'GOLD', 'SILVER'].includes(instrument)) return spot > 10000 ? 500 : 50;
    if (spot > 50000) return 100;
    if (spot > 20000) return 50;
    return 25;
  }

  function normalCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
  }

  function blackScholesCall(S, K, T, r, sigma) {
    if (T <= 0) return Math.max(0, S - K);
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  }

  function blackScholesPut(S, K, T, r, sigma) {
    if (T <= 0) return Math.max(0, K - S);
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  }

  function calcDelta(S, K, T, r, sigma, type) {
    if (T <= 0) return type === 'CE' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    return type === 'CE' ? Math.round(normalCDF(d1) * 1000) / 1000 : Math.round((normalCDF(d1) - 1) * 1000) / 1000;
  }

  return router;
};
