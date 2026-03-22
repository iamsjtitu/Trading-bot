/**
 * AI Trading Bot - Standalone Web Server (No Electron)
 * Runs the same Express API as the desktop app, for web preview/deployment.
 * Usage: node web_server.js
 */
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.env.PORT || '8001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ============ JSON DATABASE (same as desktop) ============
class JsonDatabase {
  constructor(folder) {
    this.folder = folder;
    this.dbFile = path.join(folder, 'trading-bot-data.json');
    this.data = this._load();
  }

  _load() {
    try { if (fs.existsSync(this.dbFile)) return JSON.parse(fs.readFileSync(this.dbFile, 'utf8')); }
    catch (e) { console.error('[DB] Load error:', e.message); }
    return this._defaults();
  }

  _defaults() {
    return {
      settings: {
        trading_mode: 'PAPER',
        broker: { api_key: '', api_secret: '', redirect_uri: '', access_token: '', token_timestamp: '' },
        risk: { initial_capital: 500000, daily_limit: 100000, max_per_trade: 20000, risk_tolerance: 'medium', stop_loss_pct: 25, target_pct: 50 },
        schedule: { enabled: false, trading_days: ['Monday','Tuesday','Wednesday','Thursday','Friday'], start_time: '09:15', end_time: '15:30' },
        news: { sources: ['demo'], newsapi_key: '', alphavantage_key: '', min_confidence: 60 },
        auto_trading: { auto_exit: true, auto_entry: false, auto_analysis: true, target_pct: 10, stoploss_pct: 25, analysis_interval_minutes: 5 },
        ai: { emergent_llm_key: '' },
        telegram: { enabled: false, bot_token: '', chat_id: '' },
        notifications: { desktop: false, telegram: false, on_signal: true, on_entry: true, on_exit: true },
      },
      portfolio: { initial_capital: 500000, current_value: 500000, total_pnl: 0, active_positions: 0, total_trades: 0, winning_trades: 0 },
      trades: [], signals: [], news_articles: [],
    };
  }

  save() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._doSave(), 100);
  }

  _doSave() {
    try {
      const tmp = this.dbFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      if (fs.existsSync(this.dbFile)) fs.copyFileSync(this.dbFile, this.dbFile + '.bak');
      fs.renameSync(tmp, this.dbFile);
    } catch (e) { console.error('[DB] Save error:', e.message); }
  }
}

// ============ SETUP ============
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new JsonDatabase(dataDir);

// Notification stub (no desktop notifications in web mode)
db.notify = function (type, title, body) {
  console.log(`[Notify] [${type}] ${title}: ${body}`);
};

// Load env vars into settings (for web mode)
if (process.env.EMERGENT_LLM_KEY && db.data?.settings?.ai) {
  db.data.settings.ai.emergent_llm_key = process.env.EMERGENT_LLM_KEY;
  db.save();
}

const app = express();
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ============ LOAD ROUTES ============
const routeModules = [
  { name: 'settings', load: () => require('./routes/settings')(db) },
  { name: 'portfolio', load: () => require('./routes/portfolio')(db) },
  { name: 'news', load: () => require('./routes/news')(db) },
  { name: 'trading', load: () => require('./routes/trading')(db) },
  { name: 'upstox', load: () => require('./routes/upstox')(db) },
  { name: 'tax', load: () => require('./routes/tax')(db) },
  { name: 'market_status', load: () => require('./routes/market_status')(db) },
  { name: 'extra_apis', load: () => require('./routes/extra_apis')(db) },
  { name: 'broker_router', load: () => require('./routes/broker_router')(db) },
  { name: 'technical', load: () => require('./routes/technical')(db) },
  { name: 'journal', load: () => require('./routes/journal')(db) },
  { name: 'options', load: () => require('./routes/options')(db) },
  { name: 'telegram', load: () => require('./routes/telegram')(db) },
];

let loaded = 0;
for (const rm of routeModules) {
  try { app.use(rm.load()); loaded++; console.log(`[Route OK] ${rm.name}`); }
  catch (e) { console.error(`[Route FAIL] ${rm.name}: ${e.message}`); }
}
console.log(`[Routes] ${loaded}/${routeModules.length} loaded`);

const { startBackgroundFetcher, getJobStatus, isMarketHours } = require('./routes/lib/market_data_fetcher');
const { startExitAdvisor, getAdvisorStatus: getExitAdvisorStatus } = require('./routes/lib/exit_advisor');
const { startMorningBriefing, getBriefingStatus } = require('./routes/lib/morning_briefing');

// ============ HEALTH & VERSION ============
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy', timestamp: new Date().toISOString(),
    version: '7.0.1', routes_loaded: loaded,
    services: { news: 'active', sentiment: 'active', trading: 'active' },
    background_fetcher: getJobStatus(),
    exit_advisor: getExitAdvisorStatus(),
    morning_briefing: getBriefingStatus(),
  });
});

app.get('/api/debug', (req, res) => {
  res.json({
    version: '7.0.1', routes_loaded: loaded, backend: 'node.js',
    db_keys: Object.keys(db.data || {}),
    settings_sources: db.data?.settings?.news?.sources || [],
    news_count: (db.data?.news_articles || []).length,
    trades_count: (db.data?.trades || []).length,
    signals_count: (db.data?.signals || []).length,
    market_data: {
      cached: !!db.data?.market_data?.indices,
      last_updated: db.data?.market_data?.last_updated || null,
      source: db.data?.market_data?.source || null,
      nifty: db.data?.market_data?.indices?.nifty50?.value || null,
      banknifty: db.data?.market_data?.indices?.banknifty?.value || null,
    },
    background_fetcher: getJobStatus(),
  });
});

// Background market data status endpoint
app.get('/api/market-data/bg-status', (req, res) => {
  const status = getJobStatus();
  const cached = db.data?.market_data || {};
  res.json({
    status: 'success',
    fetcher: status,
    market_hours: isMarketHours(),
    cached_data: {
      last_updated: cached.last_updated || null,
      source: cached.source || null,
      indices: cached.indices ? Object.fromEntries(
        Object.entries(cached.indices).map(([k, v]) => [k, v.value || 0])
      ) : null,
    },
  });
});

// ============ ERROR HANDLER ============
app.use((err, req, res, next) => {
  console.error(`[API Error] ${req.method} ${req.path}:`, err.message || err);
  res.status(500).json({ status: 'error', message: err.message || 'Internal server error' });
});

// ============ START ============
app.listen(PORT, HOST, () => {
  console.log(`[AI Trading Bot v7.0.1] Web server running on ${HOST}:${PORT}`);
  console.log(`[AI Trading Bot] Routes: ${loaded}/${routeModules.length} | DB: ${db.dbFile}`);

  // Start background market data fetcher
  startBackgroundFetcher(db);

  // Start AI Exit Advisor (checks open trades every 3 min)
  startExitAdvisor(db);

  // Start Morning Briefing scheduler (9:00 AM IST weekdays)
  startMorningBriefing(db);
});
