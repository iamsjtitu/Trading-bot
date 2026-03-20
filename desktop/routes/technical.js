/**
 * Technical Analysis Routes
 * Provides RSI, MACD, EMA, SMA, VWAP indicators for trading instruments.
 */
const { Router } = require('express');
const axios = require('axios');
const { analyzeCandles, generateDemoCandles, INSTRUMENT_KEYS } = require('./lib/technical_analysis');

module.exports = function (db) {
  const router = Router();

  // Upstox API interval mapping:
  // Historical: 1minute, 30minute, day, week, month
  // Intraday: 1minute, 30minute
  const INTERVAL_MAP = {
    '1minute':  { type: 'intraday', upstox: '1minute' },
    '5minute':  { type: 'intraday', upstox: '1minute' },   // aggregate from 1min
    '15minute': { type: 'intraday', upstox: '1minute' },   // aggregate from 1min
    '30minute': { type: 'intraday', upstox: '30minute' },
    '1hour':    { type: 'historical', upstox: 'day' },
    '1day':     { type: 'historical', upstox: 'day' },
  };

  function aggregateCandles(candles, targetMinutes) {
    if (targetMinutes <= 1 || !candles.length) return candles;
    const result = [];
    let bucket = null;
    for (const c of candles) {
      const ts = new Date(c.timestamp).getTime();
      const bucketStart = Math.floor(ts / (targetMinutes * 60000)) * (targetMinutes * 60000);
      if (!bucket || bucket._start !== bucketStart) {
        if (bucket) result.push({ timestamp: new Date(bucket._start).toISOString(), open: bucket.open, high: bucket.high, low: bucket.low, close: bucket.close, volume: bucket.volume });
        bucket = { _start: bucketStart, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 };
      } else {
        bucket.high = Math.max(bucket.high, c.high);
        bucket.low = Math.min(bucket.low, c.low);
        bucket.close = c.close;
        bucket.volume += c.volume || 0;
      }
    }
    if (bucket) result.push({ timestamp: new Date(bucket._start).toISOString(), open: bucket.open, high: bucket.high, low: bucket.low, close: bucket.close, volume: bucket.volume });
    return result;
  }

  // GET /api/technical/analysis
  router.get('/api/technical/analysis', async (req, res) => {
    const instrument = (req.query.instrument || 'NIFTY50').toUpperCase();
    const interval = req.query.interval || '5minute';

    try {
      let candles = null;
      let source = 'demo';

      // Try fetching from Upstox if broker is connected
      const settings = db.data?.settings || {};
      const activeBroker = settings.active_broker || settings.broker?.name || 'upstox';
      const token = settings.broker?.[`${activeBroker}_token`] || settings.broker?.access_token;

      if (token) {
        try {
          const instKey = INSTRUMENT_KEYS[instrument] || INSTRUMENT_KEYS.NIFTY50;
          const mapping = INTERVAL_MAP[interval] || INTERVAL_MAP['5minute'];
          const headers = { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' };
          let resp;

          if (mapping.type === 'intraday') {
            // Intraday endpoint: no date params needed
            const url = `https://api.upstox.com/v2/historical-candle/intraday/${encodeURIComponent(instKey)}/${mapping.upstox}`;
            resp = await axios.get(url, { headers, timeout: 10000 });
          } else {
            // Historical endpoint: needs to_date and from_date
            const now = new Date();
            const toDate = now.toISOString().substring(0, 10);
            const fromDate = new Date(now.getTime() - 90 * 86400000).toISOString().substring(0, 10);
            const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instKey)}/${mapping.upstox}/${toDate}/${fromDate}`;
            resp = await axios.get(url, { headers, timeout: 10000 });
          }

          if (resp?.data?.data?.candles?.length) {
            const raw = resp.data.data.candles;
            candles = [];
            // Upstox returns newest first, reverse to chronological order
            for (let i = raw.length - 1; i >= 0; i--) {
              const c = raw[i];
              candles.push({ timestamp: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] || 0 });
            }
            // Aggregate if needed (e.g., 1min → 5min)
            const targetMinutes = { '5minute': 5, '15minute': 15 }[interval] || 0;
            if (targetMinutes > 0 && mapping.upstox === '1minute') {
              candles = aggregateCandles(candles, targetMinutes);
            }
            source = 'upstox';
            console.log(`[TechAnalysis] ${instrument} ${interval}: ${candles.length} candles from Upstox (${mapping.type}/${mapping.upstox})`);
          }
        } catch (e) {
          console.log(`[TechAnalysis] Upstox fetch failed: ${e.response?.data?.errors?.[0]?.message || e.message}`);
        }
      }

      if (!candles) {
        candles = generateDemoCandles(instrument, interval);
        source = 'demo';
      }

      const result = analyzeCandles(candles);
      result.instrument = instrument;
      result.interval = interval;
      result.source = source;
      result.timestamp = new Date().toISOString();
      res.json({ status: 'success', ...result });
    } catch (err) {
      console.error('[TechAnalysis] Error:', err.message);
      res.json({ status: 'error', message: err.message });
    }
  });

  // GET /api/technical/intervals
  router.get('/api/technical/intervals', (req, res) => {
    res.json({
      status: 'success',
      intervals: [
        { value: '1minute', label: '1 Min' },
        { value: '5minute', label: '5 Min' },
        { value: '15minute', label: '15 Min' },
        { value: '30minute', label: '30 Min' },
        { value: '1hour', label: '1 Hour' },
        { value: '1day', label: '1 Day' },
      ],
      instruments: Object.keys(INSTRUMENT_KEYS),
    });
  });

  return router;
};
