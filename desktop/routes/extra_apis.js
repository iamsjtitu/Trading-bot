/**
 * Missing API Routes for Desktop App
 * Fills the gap between Python backend features and Node.js desktop backend
 * Includes: market-data/quick, auto-entry/status, instruments, brokers, option-chain, ws status
 */
const { Router } = require('express');
const axios = require('axios');
const crypto = require('crypto');

const INDEX_KEYS = {
  nifty50: 'NSE_INDEX|Nifty 50',
  sensex: 'BSE_INDEX|SENSEX',
  banknifty: 'NSE_INDEX|Nifty Bank',
  finnifty: 'NSE_INDEX|Nifty Fin Service',
  midcpnifty: 'NSE_INDEX|NIFTY MID SELECT',
};

const INSTRUMENTS = {
  NIFTY50: { label: 'Nifty 50 (NSE)', exchange: 'NSE', symbol: 'NIFTY', lot_size: 25, tick_size: 0.05, strike_step: 50, base_price: 24000, option_premium: '~200' },
  BANKNIFTY: { label: 'Bank Nifty (NSE)', exchange: 'NSE', symbol: 'BANKNIFTY', lot_size: 15, tick_size: 0.05, strike_step: 100, base_price: 52000, option_premium: '~300' },
  FINNIFTY: { label: 'Fin Nifty (NSE)', exchange: 'NSE', symbol: 'FINNIFTY', lot_size: 25, tick_size: 0.05, strike_step: 50, base_price: 23800, option_premium: '~150' },
  MIDCPNIFTY: { label: 'Midcap Nifty (NSE)', exchange: 'NSE', symbol: 'MIDCPNIFTY', lot_size: 50, tick_size: 0.05, strike_step: 25, base_price: 12000, option_premium: '~100' },
  SENSEX: { label: 'Sensex (BSE)', exchange: 'BSE', symbol: 'SENSEX', lot_size: 10, tick_size: 0.05, strike_step: 100, base_price: 79800, option_premium: '~250' },
  BANKEX: { label: 'Bankex (BSE)', exchange: 'BSE', symbol: 'BANKEX', lot_size: 15, tick_size: 0.05, strike_step: 100, base_price: 55000, option_premium: '~200' },
};

const BROKER_INFO = {
  upstox: { id: 'upstox', name: 'Upstox', description: 'Full API support with WebSocket', status: 'active', features: ['options', 'futures', 'websocket'] },
  zerodha: { id: 'zerodha', name: 'Zerodha', description: 'Coming soon - Kite Connect API', status: 'coming_soon', features: ['options', 'futures'] },
  angelone: { id: 'angelone', name: 'Angel One', description: 'Coming soon - SmartAPI', status: 'coming_soon', features: ['options', 'futures'] },
  '5paisa': { id: '5paisa', name: '5paisa', description: 'Coming soon - 5paisa API', status: 'coming_soon', features: ['options', 'futures'] },
  paytmmoney: { id: 'paytmmoney', name: 'Paytm Money', description: 'Coming soon - Paytm Money API', status: 'coming_soon', features: ['options'] },
  iifl: { id: 'iifl', name: 'IIFL Securities', description: 'Coming soon - IIFL Markets API', status: 'coming_soon', features: ['options', 'futures'] },
};

// Weekly expiry day mapping (UPDATED Aug 2025: NSE moved to Tuesday)
// 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const EXPIRY_DAY = {
  NIFTY50: 2, BANKNIFTY: 2, FINNIFTY: 2, MIDCPNIFTY: 2, // NSE: Tuesday (from Aug 2025)
  SENSEX: 2, BANKEX: 2, // BSE: also Tuesday
};

// Instrument key mapping for Upstox API
const INST_KEY_MAP = {
  'NIFTY50': 'NSE_INDEX|Nifty 50', 'BANKNIFTY': 'NSE_INDEX|Nifty Bank',
  'FINNIFTY': 'NSE_INDEX|Nifty Fin Service', 'MIDCPNIFTY': 'NSE_INDEX|NIFTY MID SELECT',
  'SENSEX': 'BSE_INDEX|SENSEX', 'BANKEX': 'BSE_INDEX|BANKEX',
};

// Cache for expiry dates fetched from Upstox
const expiryCache = {};

/**
 * Get the nearest valid expiry date from Upstox API
 * Falls back to calculated Tuesday if API fails
 */
async function fetchNearestExpiry(instrument, token) {
  const cacheKey = instrument;
  const now = Date.now();
  // Use cached value if less than 30 minutes old
  if (expiryCache[cacheKey] && (now - expiryCache[cacheKey].ts) < 30 * 60 * 1000) {
    return expiryCache[cacheKey].expiry;
  }

  const instKey = INST_KEY_MAP[instrument] || INST_KEY_MAP.NIFTY50;
  try {
    // Call option/contract WITHOUT expiry_date to get all available contracts
    const resp = await axios.get('https://api.upstox.com/v2/option/contract', {
      headers: { Authorization: `Bearer ${token}`, 'Api-Version': '2.0', Accept: 'application/json' },
      params: { instrument_key: instKey },
      timeout: 10000,
    });
    if (resp.data?.status === 'success' && resp.data?.data?.length > 0) {
      // Collect ALL unique expiry dates
      const todayStr = new Date(now + 5.5 * 60 * 60 * 1000).toISOString().substring(0, 10);
      const expirySet = new Set();
      for (const contract of resp.data.data) {
        const exp = (contract.expiry || '').substring(0, 10);
        if (exp && exp >= todayStr) expirySet.add(exp);
      }
      // Sort ascending and pick the NEAREST future expiry
      const sortedExpiries = [...expirySet].sort();
      if (sortedExpiries.length > 0) {
        const nearest = sortedExpiries[0];
        console.log(`[Expiry] ${instrument}: nearest expiry = ${nearest} (from ${sortedExpiries.length} available: ${sortedExpiries.slice(0, 5).join(', ')}...)`);
        expiryCache[cacheKey] = { expiry: nearest, ts: now };
        return nearest;
      }
    }
  } catch (e) {
    console.error(`[Expiry] ${instrument}: API fetch failed - ${e.response?.data?.message || e.message}`);
  }

  // Fallback: calculate next Tuesday (NSE post-Aug 2025 schedule)
  const fallback = calcNextExpiry(instrument);
  console.log(`[Expiry] ${instrument}: using calculated fallback = ${fallback}`);
  return fallback;
}

/**
 * Calculate the next weekly expiry date for an instrument (IST)
 * NSE: Tuesday (from Aug 2025), BSE: Tuesday
 * Returns YYYY-MM-DD string
 */
function calcNextExpiry(instrument) {
  const targetDay = EXPIRY_DAY[instrument] || 2; // default Tuesday
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const currentDay = ist.getUTCDay();
  const currentH = ist.getUTCHours();
  const currentMin = ist.getUTCMinutes();

  let daysToAdd = targetDay - currentDay;
  if (daysToAdd < 0) daysToAdd += 7;
  // If today is expiry day but market is closed (after 3:30 PM), move to next week
  if (daysToAdd === 0 && (currentH * 60 + currentMin) > 930) daysToAdd = 7;

  const expiryDate = new Date(ist.getTime() + daysToAdd * 86400000);
  const yyyy = expiryDate.getUTCFullYear();
  const mm = String(expiryDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(expiryDate.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Kept for backward compat
function getNextExpiry(instrument) {
  return calcNextExpiry(instrument);
}

module.exports = function (db) {
  const router = Router();

  // ==================== Version & Diagnostics ====================
  router.get('/api/version', (req, res) => {
    res.json({ status: 'success', version: '3.1.1', build_date: '2026-03-19' });
  });

  router.get('/api/diagnostics', (req, res) => {
    const settings = db.data?.settings || {};
    const activeBroker = settings.active_broker || settings.broker?.name || 'upstox';
    const token = settings.broker?.[`${activeBroker}_token`] || settings.broker?.access_token || null;
    const inst = settings.trading_instrument || 'NOT SET';
    const mode = settings.trading_mode || 'PAPER';
    const autoEntry = settings.auto_trading?.auto_entry || false;
    const autoExit = settings.auto_trading?.auto_exit !== false;
    const expiry = getNextExpiry(inst !== 'NOT SET' ? inst : 'NIFTY50');
    const tradeCount = (db.data.trades || []).length;
    const signalCount = (db.data.signals || []).length;
    const failedTrades = (db.data.trades || []).filter(t => t.status === 'FAILED').length;
    const newsCount = (db.data.news_articles || []).length;

    res.json({
      status: 'success',
      version: '3.1.1',
      diagnostics: {
        broker: activeBroker,
        broker_token: token ? `${token.substring(0, 8)}...` : 'MISSING',
        trading_mode: mode,
        active_instrument: inst,
        next_expiry: expiry,
        auto_entry: autoEntry,
        auto_exit: autoExit,
        total_signals: signalCount,
        total_trades: tradeCount,
        failed_trades: failedTrades,
        total_news: newsCount,
      },
    });
  });

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
      const allKeys = { ...INDEX_KEYS };
      const keysStr = Object.values(allKeys).join(',');
      const resp = await axios.get(`https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(keysStr)}`, {
        headers: apiHeaders(token), timeout: 10000,
      });
      if (resp.data?.status === 'success') {
        const raw = resp.data.data || {};
        const rawKeys = Object.keys(raw);
        console.log('[QuickData] API returned keys:', rawKeys.join(', '));
        const indices = {};
        for (const [key, instrument] of Object.entries(allKeys)) {
          let quote = raw[instrument];
          if (!quote) {
            // Try partial match - API might return slightly different key format
            const namePart = instrument.split('|')[1] || '';
            const matchKey = rawKeys.find(k => k === instrument || k.includes(namePart));
            if (matchKey) {
              quote = raw[matchKey];
              console.log(`[QuickData] Partial match for ${key}: ${instrument} -> ${matchKey}`);
            }
          }
          if (!quote) {
            console.log(`[QuickData] No match for ${key}: ${instrument}`);
            indices[key] = { value: 0, change: 0, changePct: 0 };
            continue;
          }
          const ltp = quote.last_price || 0;
          const netChange = quote.net_change || 0;
          const prevClose = ltp - netChange;
          const changePct = prevClose > 0 ? (netChange / prevClose) * 100 : 0;
          indices[key] = { value: ltp, change: Math.round(netChange * 100) / 100, changePct: Math.round(changePct * 100) / 100 };
        }
        // Cache market data for signal generation
        if (!db.data.market_data) db.data.market_data = {};
        db.data.market_data.indices = indices;
        db.data.market_data.last_updated = new Date().toISOString();
        return res.json({ status: 'success', data: indices, source: 'rest', ts: new Date().toISOString() });
      } else {
        console.log('[QuickData] API response not success:', resp.data?.status, resp.data?.message);
      }
    } catch (e) {
      console.error('[QuickData] Error:', e.message);
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
    db.data.settings.active_broker = brokerId; // sync with Python backend field
    db.save();
    res.json({ status: 'success', active_broker: brokerId, broker: BROKER_INFO[brokerId] });
  });

  router.get('/api/brokers/active', (req, res) => {
    const activeBroker = db.data.settings?.broker?.name || 'upstox';
    res.json({ status: 'success', broker_id: activeBroker, broker: BROKER_INFO[activeBroker] || BROKER_INFO.upstox });
  });

  // NOTE: /api/brokers/connection is handled by broker_router.js (per-broker checks)

  // ==================== Option Chain ====================
  router.get('/api/option-chain/instruments', (req, res) => {
    const instruments = {};
    for (const [key, val] of Object.entries(INSTRUMENTS)) {
      instruments[key] = {
        label: val.label, name: val.label.split(' (')[0], exchange: val.exchange,
        symbol: val.symbol, lot_size: val.lot_size, type: 'index',
      };
    }
    res.json({ status: 'success', instruments });
  });

  // ---- Option Chain Helpers: Parse live Upstox data into frontend format ----
  function parseLiveChain(instrument, liveData, numStrikes = 15, expiryDays = 7) {
    const config = INSTRUMENTS[instrument] || INSTRUMENTS.NIFTY50;
    const T = Math.max(expiryDays / 365, 1 / 365);
    const r = 0.07; // risk-free rate
    const chain = [];
    let totalCeOi = 0, totalPeOi = 0;
    const maxPainData = {};

    // Extract spot price from first item if available
    let S = config.base_price || 24000;
    if (liveData.length > 0) {
      const firstItem = liveData[0];
      const underlying = firstItem.underlying_spot_price || firstItem.underlying_price || 0;
      if (underlying > 0) S = underlying;
    }

    for (const item of liveData) {
      const strike = item.strike_price || 0;
      if (!strike) continue;

      // Extract spot from each item (more reliable)
      if (item.underlying_spot_price > 0) S = item.underlying_spot_price;

      const ceData = item.call_options?.market_data || {};
      const peData = item.put_options?.market_data || {};

      const ceLtp = ceData.ltp || 0;
      const peLtp = peData.ltp || 0;
      const ceOi = ceData.oi || 0;
      const peOi = peData.oi || 0;
      const ceVol = ceData.volume || 0;
      const peVol = peData.volume || 0;
      const ceChange = ceData.net_change || 0;
      const peChange = peData.net_change || 0;

      totalCeOi += ceOi;
      totalPeOi += peOi;

      // Calculate IV from market prices
      const ceIv = ceLtp > 0 ? calcImpliedVol(S, strike, T, r, ceLtp, 'CE') : 20;
      const peIv = peLtp > 0 ? calcImpliedVol(S, strike, T, r, peLtp, 'PE') : 20;

      const sigmaCe = Math.max(ceIv, 1) / 100;
      const sigmaPe = Math.max(peIv, 1) / 100;

      const atm = Math.round(S / (config.strike_step || 50)) * (config.strike_step || 50);

      const row = {
        strike,
        is_atm: Math.abs(strike - atm) < (config.strike_step || 50) * 0.5,
        is_itm_ce: strike < S,
        is_itm_pe: strike > S,
        live: true,
        ce: {
          ltp: ceLtp, change: ceChange,
          change_pct: ceLtp > 0 ? Math.round((ceChange / Math.max(ceLtp - ceChange, 0.01)) * 10000) / 100 : 0,
          oi: ceOi, volume: ceVol, iv: ceIv,
          bid: ceData.bid_price || Math.round(ceLtp * 0.98 * 100) / 100,
          ask: ceData.ask_price || Math.round(ceLtp * 1.02 * 100) / 100,
          delta: calcDelta(S, strike, T, r, sigmaCe, 'CE'),
          gamma: calcGamma(S, strike, T, r, sigmaCe),
          theta: calcTheta(S, strike, T, r, sigmaCe, 'CE'),
          vega: calcVega(S, strike, T, r, sigmaCe),
        },
        pe: {
          ltp: peLtp, change: peChange,
          change_pct: peLtp > 0 ? Math.round((peChange / Math.max(peLtp - peChange, 0.01)) * 10000) / 100 : 0,
          oi: peOi, volume: peVol, iv: peIv,
          bid: peData.bid_price || Math.round(peLtp * 0.98 * 100) / 100,
          ask: peData.ask_price || Math.round(peLtp * 1.02 * 100) / 100,
          delta: calcDelta(S, strike, T, r, sigmaPe, 'PE'),
          gamma: calcGamma(S, strike, T, r, sigmaPe),
          theta: calcTheta(S, strike, T, r, sigmaPe, 'PE'),
          vega: calcVega(S, strike, T, r, sigmaPe),
        },
      };
      chain.push(row);
      maxPainData[strike] = { ce_oi: ceOi, pe_oi: peOi };
    }

    // Sort by strike
    chain.sort((a, b) => a.strike - b.strike);

    // Trim to numStrikes around ATM
    const atm = Math.round(S / (config.strike_step || 50)) * (config.strike_step || 50);
    if (chain.length > numStrikes * 2 + 1) {
      let atmIdx = Math.floor(chain.length / 2);
      for (let i = 0; i < chain.length; i++) {
        if (chain[i].is_atm) { atmIdx = i; break; }
      }
      const start = Math.max(0, atmIdx - numStrikes);
      const end = Math.min(chain.length, atmIdx + numStrikes + 1);
      chain.splice(end);
      chain.splice(0, start);
    }

    // Max pain calculation
    const strikes = chain.map(r => r.strike);
    let maxPain = atm, minPain = Infinity;
    for (const testStrike of strikes) {
      let totalPain = 0;
      for (const [s, data] of Object.entries(maxPainData)) {
        const sk = Number(s);
        if (testStrike < sk) totalPain += data.ce_oi * (sk - testStrike);
        if (testStrike > sk) totalPain += data.pe_oi * (testStrike - sk);
      }
      if (totalPain < minPain) { minPain = totalPain; maxPain = testStrike; }
    }

    const pcr = totalCeOi > 0 ? Math.round((totalPeOi / totalCeOi) * 100) / 100 : 0;
    const atmRow = chain.find(r => r.is_atm) || chain[Math.floor(chain.length / 2)] || null;

    return {
      status: 'success',
      source: 'live',
      instrument,
      config,
      spot_price: Math.round(S * 100) / 100,
      atm_strike: atmRow ? atmRow.strike : atm,
      expiry_days: expiryDays,
      chain,
      summary: {
        total_ce_oi: totalCeOi,
        total_pe_oi: totalPeOi,
        pcr,
        max_pain: maxPain,
        iv_atm: atmRow ? atmRow.ce.iv : 0,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Implied Volatility using Newton-Raphson
  function calcImpliedVol(S, K, T, r, marketPrice, type) {
    if (marketPrice <= 0 || T <= 0) return 0;
    let sigma = 0.3;
    for (let i = 0; i < 100; i++) {
      const bsPrice = type === 'CE' ? blackScholesCall(S, K, T, r, sigma) : blackScholesPut(S, K, T, r, sigma);
      const diff = bsPrice - marketPrice;
      if (Math.abs(diff) < 0.01) return Math.round(sigma * 10000) / 100;
      const sqrtT = Math.sqrt(T);
      const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
      const vega = S * Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI) * sqrtT;
      if (vega < 1e-8) break;
      sigma -= diff / vega;
      sigma = Math.max(0.01, Math.min(sigma, 5.0));
    }
    return Math.round(sigma * 10000) / 100;
  }

  function calcGamma(S, K, T, r, sigma) {
    if (T <= 0 || sigma <= 0) return 0;
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    return Math.round((Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI)) / (S * sigma * sqrtT) * 1000000) / 1000000;
  }

  function calcTheta(S, K, T, r, sigma, type) {
    if (T <= 0 || sigma <= 0) return 0;
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    const pdf = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
    const common = -(S * pdf * sigma) / (2 * sqrtT);
    let theta;
    if (type === 'CE') {
      theta = (common - r * K * Math.exp(-r * T) * normalCDF(d2)) / 365;
    } else {
      theta = (common + r * K * Math.exp(-r * T) * normalCDF(-d2)) / 365;
    }
    return Math.round(theta * 100) / 100;
  }

  function calcVega(S, K, T, r, sigma) {
    if (T <= 0 || sigma <= 0) return 0;
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const pdf = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
    return Math.round(S * pdf * sqrtT / 100 * 100) / 100;
  }

  router.get('/api/option-chain/:instrument', async (req, res) => {
    const instrument = req.params.instrument;
    const instConfig = INSTRUMENTS[instrument] || INSTRUMENTS.NIFTY50;
    const expiryDays = parseInt(req.query.expiry_days) || 7;
    const numStrikes = parseInt(req.query.strikes) || 15;

    // Check market status
    const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
    const weekday = ist.getUTCDay();
    const h = ist.getUTCHours();
    const m = ist.getUTCMinutes();
    const totalMin = h * 60 + m;

    // NSE/BSE: 9:15 AM - 3:30 PM IST (555 - 930 min), Mon-Fri
    const marketOpen = weekday >= 1 && weekday <= 5 && totalMin >= 555 && totalMin < 930;

    if (!marketOpen) {
      return res.json({
        status: 'success',
        source: 'market_closed',
        instrument,
        config: instConfig,
        market_message: 'Market Closed',
        next_open: '',
        chain: [],
        summary: null,
        timestamp: new Date().toISOString(),
      });
    }

    // Market is open - check broker token
    const settings = db.data?.settings || {};
    const activeBroker = settings.active_broker || settings.broker?.name || 'upstox';
    const brokerToken = (settings.broker || {})[`${activeBroker}_token`] || settings.broker?.access_token || '';

    if (!brokerToken) {
      return res.json({
        status: 'success',
        source: 'broker_disconnected',
        instrument,
        config: instConfig,
        market_message: 'No broker connected. Go to Settings and connect your broker.',
        chain: [],
        summary: null,
        timestamp: new Date().toISOString(),
      });
    }

    // Try fetching live option chain from Upstox (NSE/BSE only)
    try {
      const instKey = INST_KEY_MAP[instrument];
      if (!instKey) {
        return res.json({ status: 'success', source: 'not_supported', instrument, config: instConfig, market_message: 'Option chain not supported for this instrument', chain: [], summary: null, timestamp: new Date().toISOString() });
      }

      // Step 1: Get the ACTUAL nearest expiry date from Upstox
      const expiryDate = await fetchNearestExpiry(instrument, brokerToken);
      console.log(`[OptionChain] Fetching ${instrument} key=${instKey} expiry=${expiryDate}`);

      // Step 2: Fetch option chain with the correct expiry
      const ocResp = await axios.get('https://api.upstox.com/v2/option/chain', {
        headers: { Authorization: `Bearer ${brokerToken}`, 'Api-Version': '2.0', Accept: 'application/json' },
        params: { instrument_key: instKey, expiry_date: expiryDate },
        timeout: 15000,
      });

      if (ocResp.data?.status === 'success' && ocResp.data?.data?.length) {
        // Parse raw Upstox data into frontend-expected format with Greeks
        const parsed = parseLiveChain(instrument, ocResp.data.data, numStrikes, expiryDays);
        console.log(`[OptionChain] ${instrument}: ${parsed.chain.length} strikes, spot=${parsed.spot_price}`);
        return res.json(parsed);
      }

      const apiMsg = ocResp.data?.message || ocResp.data?.errors?.[0]?.message || 'No data from broker';
      console.log(`[OptionChain] ${instrument}: API returned no data - ${apiMsg}`);
      return res.json({ status: 'success', source: 'broker_error', instrument, config: instConfig, market_message: apiMsg, chain: [], summary: null, timestamp: new Date().toISOString() });
    } catch (err) {
      // Extract detailed error from Upstox response
      const errData = err.response?.data;
      const errMsg = errData?.message || errData?.errors?.[0]?.message || err.message;
      const errStatus = err.response?.status || 'unknown';
      console.error(`[OptionChain] ${instrument}: Error ${errStatus} - ${errMsg}`);
      return res.json({ status: 'success', source: 'broker_error', instrument, config: instConfig, market_message: `Broker error (${errStatus}): ${errMsg}`, chain: [], summary: null, timestamp: new Date().toISOString() });
    }
  });

  router.get('/api/option-chain/oi-buildup/:instrument', (req, res) => {
    const instrument = req.params.instrument;

    // Check market status
    const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
    const weekday = ist.getUTCDay();
    const h = ist.getUTCHours();
    const m = ist.getUTCMinutes();
    const totalMin = h * 60 + m;
    const instConfig = INSTRUMENTS[instrument] || INSTRUMENTS.NIFTY50;
    const exchange = instConfig.exchange || 'NSE';

    let marketOpen = weekday >= 1 && weekday <= 5 && totalMin >= 555 && totalMin < 930;

    if (!marketOpen) {
      return res.json({ status: 'success', instrument, alerts: [], message: 'Market Closed', source: 'market_closed', timestamp: new Date().toISOString() });
    }

    // OI alerts need live broker data
    res.json({ status: 'success', instrument, alerts: [], message: 'OI alerts require live broker data', source: 'needs_live_data', timestamp: new Date().toISOString() });
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
    const defaults = { NIFTY50: 24000, BANKNIFTY: 52000, FINNIFTY: 23800, MIDCPNIFTY: 12500, SENSEX: 79500, BANKEX: 57000 };
    return defaults[instrument] || 24000;
  }

  function getStrikeStep(instrument, spot) {
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
