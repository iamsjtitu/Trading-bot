/**
 * MCX Instrument Resolver for Desktop App
 * Downloads Upstox MCX instrument file and finds near-month futures.
 */
const https = require('https');
const http = require('http');
const zlib = require('zlib');

const MCX_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/MCX.json.gz';
const MCX_CSV_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/MCX.csv.gz';
const TARGET_COMMODITIES = ['CRUDEOIL', 'GOLD', 'SILVER'];

let _cache = {};
let _cacheTime = null;
const CACHE_HOURS = 6;

function downloadGzip(url) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    options.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, application/gzip, */*',
    };
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: options.headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadGzip(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const buf = Buffer.concat(chunks);
          try { resolve(JSON.parse(buf.toString('utf-8'))); } catch (_) {
            const data = zlib.gunzipSync(buf);
            resolve(JSON.parse(data.toString('utf-8')));
          }
        } catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function findNearestFuture(instruments, underlying) {
  const now = Date.now();
  const futures = instruments.filter(inst => {
    const type = inst.instrument_type || '';
    const sym = (inst.underlying_symbol || inst.asset_symbol || '').toUpperCase();
    return type === 'FUT' && sym === underlying.toUpperCase();
  }).map(inst => {
    const expRaw = inst.expiry;
    let expiry = typeof expRaw === 'number' ? expRaw : parseInt(expRaw) || null;
    // If looks like seconds (not ms), convert
    if (expiry && expiry < 1e12) expiry *= 1000;
    return {
      key: inst.instrument_key || '',
      symbol: inst.trading_symbol || '',
      expiry,
      lot: inst.lot_size || 1,
    };
  }).filter(f => f.expiry && f.expiry > now && f.key);

  futures.sort((a, b) => a.expiry - b.expiry);
  return futures[0] || null;
}

async function getMCXKeys() {
  // Check cache
  if (_cacheTime && (Date.now() - _cacheTime) < CACHE_HOURS * 3600000 && Object.keys(_cache).length) {
    return _cache;
  }

  try {
    const instruments = await downloadGzip(MCX_URL);
    const result = {};
    for (const commodity of TARGET_COMMODITIES) {
      const fut = findNearestFuture(instruments, commodity);
      if (fut) {
        result[commodity.toLowerCase()] = fut.key;
        console.log(`[MCX] ${commodity}: ${fut.key} (${fut.symbol})`);
      }
    }
    if (Object.keys(result).length) {
      _cache = result;
      _cacheTime = Date.now();
    }
    return result;
  } catch (e) {
    console.log('[MCX] Resolution failed:', e.message);
    return _cache || {};
  }
}

module.exports = { getMCXKeys };
