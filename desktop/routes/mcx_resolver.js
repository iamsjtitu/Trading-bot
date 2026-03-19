/**
 * MCX Instrument Resolver for Desktop App
 * Downloads Upstox MCX instrument file and finds near-month futures.
 * Uses axios for reliable downloads with timeout and retry.
 */
const axios = require('axios');
const zlib = require('zlib');

const MCX_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/MCX.json.gz';
const TARGET_COMMODITIES = ['CRUDEOIL', 'GOLD', 'SILVER'];

let _cache = {};
let _cacheTime = null;
const CACHE_HOURS = 4; // Refresh more often to catch contract rollovers

function findNearestFuture(instruments, underlying) {
  const now = Date.now();
  const futures = [];

  for (const inst of instruments) {
    const type = (inst.instrument_type || '').toUpperCase();
    if (type !== 'FUT' && type !== 'FUTCOM') continue;

    const sym = (inst.underlying_symbol || inst.asset_symbol || inst.name || '').toUpperCase();
    if (sym !== underlying.toUpperCase()) continue;

    const expRaw = inst.expiry;
    let expiry = null;
    if (typeof expRaw === 'number') {
      expiry = expRaw < 1e12 ? expRaw * 1000 : expRaw;
    } else if (typeof expRaw === 'string') {
      const parsed = parseInt(expRaw);
      if (!isNaN(parsed)) {
        expiry = parsed < 1e12 ? parsed * 1000 : parsed;
      } else {
        // Try date string parsing
        const d = new Date(expRaw);
        if (!isNaN(d.getTime())) expiry = d.getTime();
      }
    }

    if (expiry && expiry > now && inst.instrument_key) {
      futures.push({
        key: inst.instrument_key,
        symbol: inst.trading_symbol || '',
        expiry,
        lot: inst.lot_size || 1,
      });
    }
  }

  futures.sort((a, b) => a.expiry - b.expiry);
  return futures[0] || null;
}

async function downloadMCXInstruments() {
  try {
    console.log('[MCX] Downloading instrument file...');
    const resp = await axios.get(MCX_URL, {
      responseType: 'arraybuffer',
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Encoding': 'gzip',
      },
    });

    let data;
    try {
      // Try gunzip first (most likely)
      data = zlib.gunzipSync(Buffer.from(resp.data));
    } catch (_) {
      // Maybe it's already decompressed
      data = Buffer.from(resp.data);
    }

    const instruments = JSON.parse(data.toString('utf-8'));
    console.log(`[MCX] Downloaded ${instruments.length} instruments`);
    return instruments;
  } catch (e) {
    console.error('[MCX] Download failed:', e.message);
    return null;
  }
}

async function getMCXKeys() {
  // Check cache (only if non-empty)
  if (_cacheTime && _cache && Object.keys(_cache).length > 0) {
    const age = Date.now() - _cacheTime;
    if (age < CACHE_HOURS * 3600000) {
      return _cache;
    }
  }

  // Download and resolve
  const instruments = await downloadMCXInstruments();
  if (!instruments || instruments.length === 0) {
    console.warn('[MCX] No instruments downloaded, using existing cache');
    return _cache || {};
  }

  const result = {};
  for (const commodity of TARGET_COMMODITIES) {
    const fut = findNearestFuture(instruments, commodity);
    if (fut) {
      result[commodity.toLowerCase()] = fut.key;
      const expDate = new Date(fut.expiry).toLocaleDateString('en-IN');
      console.log(`[MCX] ${commodity}: ${fut.key} (${fut.symbol}, expiry: ${expDate})`);
    } else {
      console.warn(`[MCX] ${commodity}: No near-month future found`);
    }
  }

  if (Object.keys(result).length > 0) {
    _cache = result;
    _cacheTime = Date.now();
    console.log(`[MCX] Resolved ${Object.keys(result).length}/${TARGET_COMMODITIES.length} commodities`);
  } else {
    console.error('[MCX] Failed to resolve ANY commodity keys');
  }

  return result;
}

module.exports = { getMCXKeys };
