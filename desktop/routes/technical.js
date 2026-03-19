/**
 * Technical Analysis Routes
 * Provides RSI, MACD, EMA, SMA, VWAP indicators for trading instruments.
 */
const { Router } = require('express');
const axios = require('axios');
const { analyzeCandles, generateDemoCandles, INSTRUMENT_KEYS } = require('./lib/technical_analysis');

module.exports = function (db) {
  const router = Router();

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
          const now = new Date();
          const toDate = now.toISOString().substring(0, 10);
          const fromDate = new Date(now.getTime() - 30 * 86400000).toISOString().substring(0, 10);
          const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instKey)}/${interval}/${toDate}/${fromDate}`;
          const headers = { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' };
          const resp = await axios.get(url, { headers, timeout: 10000 });

          if (resp.data?.data?.candles?.length) {
            const raw = resp.data.data.candles;
            candles = [];
            for (let i = raw.length - 1; i >= 0; i--) {
              const c = raw[i];
              candles.push({ timestamp: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] || 0 });
            }
            source = 'upstox';
          }
        } catch (e) {
          console.log(`[TechAnalysis] Upstox fetch failed: ${e.message}`);
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
