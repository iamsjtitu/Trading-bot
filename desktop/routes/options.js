/**
 * Options Analytics Routes - Greeks, IV, Position Sizing
 */
const { Router } = require('express');
const axios = require('axios');
const { blackScholes, calcIV, calcIVRank, calcIVPercentile, getDaysToExpiry, analyzeOption } = require('./lib/greeks');
const { calculatePositionSize, getSignalPositionSize } = require('./lib/position_sizing');

module.exports = function (db) {
  const router = Router();
  const RISK_FREE_RATE = 0.07; // India 10Y bond ~7%

  function getToken() {
    const s = db.data?.settings || {};
    return s.broker?.upstox_token || s.broker?.access_token || '';
  }

  // GET /api/options/greeks - Calculate Greeks for a specific option or position
  router.get('/api/options/greeks', async (req, res) => {
    const { strike, type, expiry, spot, premium } = req.query;
    const S = parseFloat(spot || req.query.underlying_price || 0);
    const K = parseFloat(strike || 0);
    const optType = (type || 'CE').toUpperCase();
    const marketPremium = parseFloat(premium || 0);

    if (!S || !K) {
      return res.json({ status: 'error', message: 'Required: spot (underlying price) and strike' });
    }

    const daysToExpiry = getDaysToExpiry(expiry);
    const T = daysToExpiry / 365;

    // Calculate IV from market premium if provided
    let iv = 0.20; // default 20%
    if (marketPremium > 0) {
      iv = calcIV(optType, marketPremium, S, K, T, RISK_FREE_RATE);
    }

    const greeks = blackScholes(optType, S, K, T, RISK_FREE_RATE, iv);
    const analysis = analyzeOption(greeks, iv, 50); // default IVR 50 if no historical

    res.json({
      status: 'success',
      option: { strike: K, type: optType, spot: S, days_to_expiry: Math.round(daysToExpiry * 10) / 10, time_to_expiry_years: Math.round(T * 10000) / 10000 },
      greeks: { delta: greeks.delta, gamma: greeks.gamma, theta: greeks.theta, vega: greeks.vega },
      iv: { implied_volatility: Math.round(iv * 10000) / 100, bs_price: greeks.price },
      analysis,
    });
  });

  // GET /api/options/chain-greeks - Greeks for the full option chain around ATM
  router.get('/api/options/chain-greeks', async (req, res) => {
    const instrument = (req.query.instrument || 'NIFTY50').toUpperCase();
    const token = getToken();

    // Get current spot price
    let spotPrice = parseFloat(req.query.spot || 0);
    if (!spotPrice && token) {
      try {
        const instKeyMap = { NIFTY50: 'NSE_INDEX|Nifty 50', BANKNIFTY: 'NSE_INDEX|Nifty Bank' };
        const instKey = instKeyMap[instrument] || instKeyMap.NIFTY50;
        const headers = { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' };
        const ltpResp = await axios.get(`https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodeURIComponent(instKey)}`, { headers, timeout: 10000 });
        const quotes = ltpResp.data?.data || {};
        const key = Object.keys(quotes)[0];
        spotPrice = quotes[key]?.last_price || 0;
      } catch (e) { /* use default */ }
    }
    if (!spotPrice) spotPrice = instrument === 'BANKNIFTY' ? 52000 : 24000;

    // Generate strikes around ATM
    const stepSize = instrument === 'BANKNIFTY' ? 100 : 50;
    const atmStrike = Math.round(spotPrice / stepSize) * stepSize;
    const strikes = [];
    for (let i = -5; i <= 5; i++) strikes.push(atmStrike + i * stepSize);

    const daysToExpiry = getDaysToExpiry();
    const T = daysToExpiry / 365;
    const defaultIV = 0.15;

    const chain = strikes.map(K => {
      const ceGreeks = blackScholes('CE', spotPrice, K, T, RISK_FREE_RATE, defaultIV);
      const peGreeks = blackScholes('PE', spotPrice, K, T, RISK_FREE_RATE, defaultIV);
      const moneyness = K === atmStrike ? 'ATM' : K < spotPrice ? (ceGreeks.delta > 0.5 ? 'ITM' : 'OTM') : (peGreeks.delta < -0.5 ? 'ITM' : 'OTM');

      return {
        strike: K,
        moneyness,
        is_atm: K === atmStrike,
        ce: { price: ceGreeks.price, delta: ceGreeks.delta, gamma: ceGreeks.gamma, theta: ceGreeks.theta, vega: ceGreeks.vega, iv: Math.round(defaultIV * 10000) / 100 },
        pe: { price: peGreeks.price, delta: peGreeks.delta, gamma: peGreeks.gamma, theta: peGreeks.theta, vega: peGreeks.vega, iv: Math.round(defaultIV * 10000) / 100 },
      };
    });

    res.json({
      status: 'success',
      instrument,
      spot_price: spotPrice,
      atm_strike: atmStrike,
      days_to_expiry: Math.round(daysToExpiry * 10) / 10,
      risk_free_rate: RISK_FREE_RATE * 100,
      chain,
    });
  });

  // GET /api/options/iv-analysis - IV analysis for current positions
  router.get('/api/options/iv-analysis', (req, res) => {
    const openTrades = (db.data.trades || []).filter(t => t.status === 'OPEN');
    const instrument = (req.query.instrument || db.data?.settings?.trading_instrument || 'NIFTY50').toUpperCase();

    // Extract historical IVs from signals
    const historicalIVs = (db.data.signals || []).filter(s => s.iv).map(s => s.iv).slice(-30);
    const currentIV = historicalIVs.length > 0 ? historicalIVs[historicalIVs.length - 1] : 15;
    const ivRank = calcIVRank(currentIV, historicalIVs);
    const ivPercentile = calcIVPercentile(currentIV, historicalIVs);

    // Analyze open positions
    const positionGreeks = openTrades.map(trade => {
      const strike = trade.strike_price || extractStrike(trade.symbol || '');
      const optType = trade.trade_type === 'CALL' ? 'CE' : 'PE';
      const spot = trade.current_price || trade.entry_price * 1.1 || 100;
      const entryPrice = trade.entry_price || 100;
      const daysToExpiry = getDaysToExpiry(trade.expiry_date);
      const T = daysToExpiry / 365;
      const iv = calcIV(optType, entryPrice, spot, strike || spot, T, RISK_FREE_RATE) || 0.15;
      const greeks = blackScholes(optType, spot, strike || spot, T, RISK_FREE_RATE, iv);

      return {
        trade_id: trade.id,
        symbol: trade.symbol,
        type: optType,
        strike,
        entry_price: entryPrice,
        greeks,
        iv: Math.round(iv * 10000) / 100,
        days_to_expiry: Math.round(daysToExpiry),
        daily_theta_loss: Math.abs(greeks.theta * (trade.quantity || 1)),
      };
    });

    const totalTheta = positionGreeks.reduce((s, p) => s + p.daily_theta_loss, 0);
    const totalDelta = positionGreeks.reduce((s, p) => s + (p.greeks.delta * (p.type === 'PE' ? -1 : 1)), 0);

    res.json({
      status: 'success',
      instrument,
      iv_summary: {
        current_iv: currentIV,
        iv_rank: ivRank,
        iv_percentile: ivPercentile,
        signal: ivRank > 70 ? 'HIGH_IV' : ivRank < 30 ? 'LOW_IV' : 'NORMAL_IV',
        recommendation: ivRank > 70 ? 'Avoid buying options (premium expensive)' : ivRank < 30 ? 'Good time to buy options (premium cheap)' : 'IV is normal range',
      },
      portfolio_greeks: {
        total_delta: Math.round(totalDelta * 1000) / 1000,
        total_daily_theta: Math.round(totalTheta * 100) / 100,
        net_direction: totalDelta > 0.1 ? 'BULLISH' : totalDelta < -0.1 ? 'BEARISH' : 'NEUTRAL',
      },
      positions: positionGreeks,
    });
  });

  // GET /api/position-sizing - Kelly Criterion position sizing
  router.get('/api/position-sizing', (req, res) => {
    const sizing = calculatePositionSize(db);
    res.json({ status: 'success', ...sizing });
  });

  // POST /api/position-sizing/mode - Update sizing mode
  router.post('/api/position-sizing/mode', (req, res) => {
    const { mode } = req.body || {};
    const validModes = ['conservative', 'balanced', 'aggressive'];
    if (!validModes.includes(mode)) return res.json({ status: 'error', message: `Mode must be one of: ${validModes.join(', ')}` });

    if (!db.data.settings) db.data.settings = {};
    if (!db.data.settings.ai_guards) db.data.settings.ai_guards = {};
    db.data.settings.ai_guards.position_sizing_mode = mode;
    db.save();

    const sizing = calculatePositionSize(db);
    res.json({ status: 'success', mode, ...sizing });
  });

  function extractStrike(symbol) {
    const match = symbol.match(/(\d{4,6})(CE|PE)/i);
    return match ? parseInt(match[1]) : 0;
  }

  return router;
};
