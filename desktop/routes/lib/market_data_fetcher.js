/**
 * Background Market Data Fetcher
 * Fetches live spot prices for all indices every 60 seconds during market hours.
 * Caches data in db.data.market_data for use by Greeks filter, Kelly Criterion, and signal generation.
 */
const axios = require('axios');

const INDEX_KEYS = {
  nifty50: 'NSE_INDEX|Nifty 50',
  sensex: 'BSE_INDEX|SENSEX',
  banknifty: 'NSE_INDEX|Nifty Bank',
  finnifty: 'NSE_INDEX|Nifty Fin Service',
  midcpnifty: 'NSE_INDEX|NIFTY MID SELECT',
};

// Track job state
let jobState = {
  running: false,
  intervalId: null,
  last_fetch: null,
  last_status: 'idle',
  fetch_count: 0,
  error_count: 0,
  last_error: null,
};

function isMarketHours() {
  const now = new Date();
  // IST = UTC + 5:30
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const day = ist.getUTCDay(); // 0=Sun, 6=Sat
  const hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  const timeMinutes = hours * 60 + minutes;

  // Weekdays only (Mon-Fri)
  if (day === 0 || day === 6) return false;

  // Market hours: 9:00 AM - 3:45 PM IST (fetch starts 15 min early, ends 15 min late for pre/post)
  // 9:00 = 540, 15:45 = 945
  return timeMinutes >= 540 && timeMinutes <= 945;
}

async function fetchMarketData(db) {
  const activeBroker = db.data?.settings?.broker?.name || 'upstox';
  const token = db.data?.settings?.broker?.[`${activeBroker}_token`] || null;

  if (!token) {
    jobState.last_status = 'no_token';
    // Don't clear existing cached data — keep last known values
    return;
  }

  if (!isMarketHours()) {
    jobState.last_status = 'market_closed';
    // Don't clear existing cached data — keep last known values
    return;
  }

  try {
    const keysStr = Object.values(INDEX_KEYS).join(',');
    const resp = await axios.get(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(keysStr)}`,
      {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' },
        timeout: 8000,
      }
    );

    if (resp.data?.status === 'success') {
      const raw = resp.data.data || {};
      const rawKeys = Object.keys(raw);
      const indices = {};

      for (const [key, instrument] of Object.entries(INDEX_KEYS)) {
        let quote = raw[instrument];
        if (!quote) {
          const namePart = instrument.split('|')[1] || '';
          const matchKey = rawKeys.find(k => k === instrument || k.includes(namePart));
          if (matchKey) quote = raw[matchKey];
        }
        if (!quote) {
          indices[key] = { value: 0, change: 0, changePct: 0 };
          continue;
        }
        const ltp = quote.last_price || 0;
        let netChange = quote.net_change || 0;
        let changePct = quote.percentage_change || 0;
        const prevClose = quote.ohlc?.close || (ltp - netChange) || 0;
        if (netChange === 0 && prevClose > 0 && ltp > 0 && ltp !== prevClose) {
          netChange = ltp - prevClose;
          changePct = (netChange / prevClose) * 100;
        }
        if (changePct === 0 && prevClose > 0 && netChange !== 0) {
          changePct = (netChange / prevClose) * 100;
        }
        indices[key] = { value: ltp, change: Math.round(netChange * 100) / 100, changePct: Math.round(changePct * 100) / 100 };
      }

      // Cache in DB
      if (!db.data.market_data) db.data.market_data = {};
      db.data.market_data.indices = indices;
      db.data.market_data.last_updated = new Date().toISOString();
      db.data.market_data.source = 'background_job';

      jobState.fetch_count++;
      jobState.last_fetch = new Date().toISOString();
      jobState.last_status = 'success';
      jobState.last_error = null;

      // Log with spot prices for visibility
      const nifty = indices.nifty50?.value || 0;
      const bnf = indices.banknifty?.value || 0;
      console.log(`[BgFetch] #${jobState.fetch_count} Nifty: ${nifty} | BankNifty: ${bnf} | ${Object.keys(indices).filter(k => indices[k].value > 0).length}/5 indices live`);
    } else {
      jobState.last_status = 'api_error';
      jobState.error_count++;
      jobState.last_error = resp.data?.message || 'API not success';
    }
  } catch (e) {
    jobState.error_count++;
    jobState.last_status = 'fetch_error';
    jobState.last_error = e.message;
    // Check if token expired (401/403)
    if (e.response?.status === 401 || e.response?.status === 403) {
      jobState.last_status = 'token_expired';
      jobState.last_error = `Token expired (${e.response.status}). Please re-authenticate with broker.`;
      console.log(`[BgFetch] Token expired (${e.response.status}). Market data will stop until re-auth.`);
    } else if (jobState.error_count % 5 === 1) {
      console.log(`[BgFetch] Error (${jobState.error_count}): ${e.message}`);
    }
    // IMPORTANT: Don't clear db.data.market_data — keep last known values
  }
}

function startBackgroundFetcher(db) {
  if (jobState.running) return;

  console.log('[BgFetch] Starting background market data fetcher (60s interval)');
  jobState.running = true;

  // First fetch immediately
  fetchMarketData(db);

  // Then every 60 seconds
  jobState.intervalId = setInterval(() => fetchMarketData(db), 60000);
}

function stopBackgroundFetcher() {
  if (jobState.intervalId) {
    clearInterval(jobState.intervalId);
    jobState.intervalId = null;
  }
  jobState.running = false;
  console.log('[BgFetch] Background fetcher stopped');
}

function getJobStatus() {
  return { ...jobState, intervalId: undefined };
}

module.exports = { startBackgroundFetcher, stopBackgroundFetcher, getJobStatus, isMarketHours };
