/**
 * AI Trading Bot - Backend API Test Suite
 * Tests all 5 route modules: settings, portfolio, news, trading, upstox
 * 
 * Run: cd /app/desktop && node test_api.js
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Test configuration
const TEST_PORT = 9881;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// ============ MOCK JSON DATABASE (same as main.js line 33-78) ============
class JsonDatabase {
  constructor() {
    this.folder = '/tmp/test-trading-bot';
    if (!fs.existsSync(this.folder)) fs.mkdirSync(this.folder, { recursive: true });
    this.dbFile = path.join(this.folder, 'trading-bot-data.json');
    this.data = this._defaults();
  }

  _defaults() {
    return {
      settings: {
        type: 'main',
        trading_mode: 'PAPER',
        broker: { api_key: '', api_secret: '', redirect_uri: '', access_token: '', token_timestamp: '' },
        risk: { initial_capital: 500000, daily_limit: 100000, max_per_trade: 20000, risk_tolerance: 'medium', stop_loss_pct: 25, target_pct: 50 },
        schedule: { enabled: true, trading_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], start_time: '09:15', end_time: '15:30', timezone: 'Asia/Kolkata' },
        news: { sources: ['demo'], newsapi_key: '', alphavantage_key: '', min_confidence: 60 },
        auto_trading: { auto_exit: true, auto_entry: false, auto_analysis: true, target_pct: 10, stoploss_pct: 25, analysis_interval_minutes: 5 },
        ai: { emergent_llm_key: '' }
      },
      portfolio: null,
      trades: [],
      signals: [],
      news_articles: [],
    };
  }

  save() {
    try {
      fs.writeFileSync(this.dbFile, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error('DB save error:', e.message);
    }
  }

  reset() {
    this.data = this._defaults();
    this.save();
  }
}

// ============ HTTP REQUEST HELPER ============
async function request(method, path, body = null, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ============ TEST RESULTS TRACKER ============
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details = '') {
  results.total++;
  if (passed) {
    results.passed++;
    console.log(`✅ PASS: ${name}`);
  } else {
    results.failed++;
    console.log(`❌ FAIL: ${name} - ${details}`);
  }
  results.tests.push({ name, passed, details });
}

// ============ TEST CASES ============

// --- SETTINGS TESTS ---
async function testGetSettings() {
  try {
    const res = await request('GET', '/api/settings');
    const pass = res.status === 200 && res.data.status === 'success' && res.data.settings;
    logTest('GET /api/settings - returns default settings if none exist', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/settings - returns default settings if none exist', false, e.message);
    return false;
  }
}

async function testUpdateSettings() {
  try {
    // Test valid update with deep merge
    const res = await request('POST', '/api/settings/update', {
      risk: { max_per_trade: 15000 }
    });
    const pass = res.status === 200 && res.data.status === 'success' &&
      res.data.settings?.risk?.max_per_trade === 15000;
    logTest('POST /api/settings/update - updates settings with deep merge', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('POST /api/settings/update - updates settings with deep merge', false, e.message);
    return false;
  }
}

async function testUpdateSettingsRiskValidation() {
  try {
    // Test validation: daily_limit < max_per_trade
    const res = await request('POST', '/api/settings/update', {
      risk: { daily_limit: 5000, max_per_trade: 10000 }
    });
    const pass = res.status === 200 && res.data.status === 'error' &&
      res.data.message.includes('Daily limit must be greater');
    logTest('POST /api/settings/update - validates risk limits (daily < max)', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('POST /api/settings/update - validates risk limits (daily < max)', false, e.message);
    return false;
  }
}

async function testUpdateSettingsMinTradeValidation() {
  try {
    // Test validation: max_per_trade < 1000
    const res = await request('POST', '/api/settings/update', {
      risk: { max_per_trade: 500 }
    });
    const pass = res.status === 200 && res.data.status === 'error' &&
      res.data.message.includes('at least 1,000');
    logTest('POST /api/settings/update - validates max_per_trade >= 1000', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('POST /api/settings/update - validates max_per_trade >= 1000', false, e.message);
    return false;
  }
}

async function testTradingStatus() {
  try {
    const res = await request('GET', '/api/settings/trading-status');
    const pass = res.status === 200 && res.data.status === 'success' &&
      typeof res.data.allowed === 'boolean' && typeof res.data.reason === 'string';
    logTest('GET /api/settings/trading-status - checks trading schedule', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/settings/trading-status - checks trading schedule', false, e.message);
    return false;
  }
}

// --- PORTFOLIO TESTS ---
async function testInitialize() {
  try {
    const res = await request('POST', '/api/initialize');
    const pass = res.status === 200 && res.data.status === 'success' &&
      res.data.message === 'Trading system initialized' && typeof res.data.capital === 'number';
    logTest('POST /api/initialize - initializes portfolio', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('POST /api/initialize - initializes portfolio', false, e.message);
    return false;
  }
}

async function testGetPortfolio() {
  try {
    const res = await request('GET', '/api/portfolio');
    const pass = res.status === 200 &&
      typeof res.data.initial_capital === 'number' &&
      typeof res.data.current_value === 'number' &&
      typeof res.data.available_capital === 'number';
    logTest('GET /api/portfolio - returns portfolio with simulated P&L', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/portfolio - returns portfolio with simulated P&L', false, e.message);
    return false;
  }
}

async function testGetStats() {
  try {
    const res = await request('GET', '/api/stats');
    const pass = res.status === 200 && res.data.status === 'success' &&
      res.data.stats &&
      typeof res.data.stats.total_news_analyzed === 'number' &&
      typeof res.data.stats.total_signals_generated === 'number';
    logTest('GET /api/stats - returns overall statistics', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/stats - returns overall statistics', false, e.message);
    return false;
  }
}

async function testCombinedStatus() {
  try {
    const res = await request('GET', '/api/combined-status');
    const pass = res.status === 200 && res.data.status === 'success' &&
      res.data.mode === 'PAPER' &&
      res.data.upstox_connected === false;
    logTest('GET /api/combined-status - returns dashboard status for PAPER mode', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/combined-status - returns dashboard status for PAPER mode', false, e.message);
    return false;
  }
}

// --- NEWS TESTS ---
async function testNewsFetch() {
  try {
    const res = await request('GET', '/api/news/fetch', null, 30000);
    const pass = res.status === 200 && res.data.status === 'success' &&
      typeof res.data.articles_processed === 'number' &&
      Array.isArray(res.data.articles);
    logTest('GET /api/news/fetch - fetches demo news, runs sentiment analysis', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data).slice(0, 500)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/news/fetch - fetches demo news, runs sentiment analysis', false, e.message);
    return false;
  }
}

async function testNewsLatest() {
  try {
    const res = await request('GET', '/api/news/latest');
    const pass = res.status === 200 && res.data.status === 'success' &&
      typeof res.data.count === 'number' && Array.isArray(res.data.news);
    logTest('GET /api/news/latest - returns stored news sorted by date', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data).slice(0, 300)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/news/latest - returns stored news sorted by date', false, e.message);
    return false;
  }
}

// --- TRADING/SIGNALS TESTS ---
async function testSignalsLatest() {
  try {
    const res = await request('GET', '/api/signals/latest');
    const pass = res.status === 200 && res.data.status === 'success' &&
      typeof res.data.count === 'number' && Array.isArray(res.data.signals);
    logTest('GET /api/signals/latest - returns signals sorted by date', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/signals/latest - returns signals sorted by date', false, e.message);
    return false;
  }
}

async function testSignalsActive() {
  try {
    const res = await request('GET', '/api/signals/active');
    const pass = res.status === 200 && res.data.status === 'success' &&
      typeof res.data.count === 'number' && Array.isArray(res.data.signals);
    logTest('GET /api/signals/active - returns active signals only', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/signals/active - returns active signals only', false, e.message);
    return false;
  }
}

async function testTradesActive() {
  try {
    const res = await request('GET', '/api/trades/active');
    const pass = res.status === 200 && res.data.status === 'success' &&
      typeof res.data.count === 'number' && Array.isArray(res.data.trades);
    logTest('GET /api/trades/active - returns open trades with simulated live P&L', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/trades/active - returns open trades with simulated live P&L', false, e.message);
    return false;
  }
}

async function testTradesToday() {
  try {
    const res = await request('GET', '/api/trades/today');
    const pass = res.status === 200 && res.data.status === 'success' &&
      typeof res.data.total_trades_today === 'number' &&
      typeof res.data.closed_trades === 'number' &&
      typeof res.data.open_trades === 'number';
    logTest('GET /api/trades/today - returns today\'s trade summary', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/trades/today - returns today\'s trade summary', false, e.message);
    return false;
  }
}

async function testTradesHistory() {
  try {
    const res = await request('GET', '/api/trades/history');
    const pass = res.status === 200 && res.data.status === 'success' &&
      typeof res.data.count === 'number' && Array.isArray(res.data.trades);
    logTest('GET /api/trades/history - returns all trades sorted by date', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/trades/history - returns all trades sorted by date', false, e.message);
    return false;
  }
}

async function testAutoExitCheck() {
  try {
    const res = await request('POST', '/api/auto-exit/check');
    const pass = res.status === 200 && res.data.status === 'success' &&
      typeof res.data.exits_executed === 'number' &&
      typeof res.data.new_trades_generated === 'number';
    logTest('POST /api/auto-exit/check - checks open trades for target/stoploss exit', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('POST /api/auto-exit/check - checks open trades for target/stoploss exit', false, e.message);
    return false;
  }
}

async function testAutoSettingsUpdate() {
  try {
    const res = await request('POST', '/api/auto-settings/update', {
      auto_exit: false,
      auto_entry: true,
      target_pct: 60
    });
    const pass = res.status === 200 && res.data.status === 'success' &&
      res.data.settings?.auto_exit === false &&
      res.data.settings?.auto_entry === true;
    logTest('POST /api/auto-settings/update - updates auto-trading settings', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('POST /api/auto-settings/update - updates auto-trading settings', false, e.message);
    return false;
  }
}

async function testAutoSettingsGet() {
  try {
    const res = await request('GET', '/api/auto-settings');
    const pass = res.status === 200 && res.data.status === 'success' &&
      typeof res.data.settings?.auto_exit === 'boolean' &&
      typeof res.data.settings?.auto_entry === 'boolean';
    logTest('GET /api/auto-settings - returns current auto-trading settings', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/auto-settings - returns current auto-trading settings', false, e.message);
    return false;
  }
}

async function testGenerateTrade() {
  try {
    const res = await request('POST', '/api/test/generate-trade');
    // Can be success or failed depending on news availability
    const pass = res.status === 200 && (res.data.status === 'success' || res.data.status === 'failed');
    logTest('POST /api/test/generate-trade - generates trade from existing news', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('POST /api/test/generate-trade - generates trade from existing news', false, e.message);
    return false;
  }
}

// --- UPSTOX TESTS ---
async function testUpstoxAuthUrl() {
  try {
    const res = await request('GET', '/api/upstox/auth-url');
    const pass = res.status === 200 && res.data.status === 'error' &&
      res.data.message.includes('API Key and Redirect URI required');
    logTest('GET /api/upstox/auth-url - returns error without broker config', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/upstox/auth-url - returns error without broker config', false, e.message);
    return false;
  }
}

async function testUpstoxConnection() {
  try {
    const res = await request('GET', '/api/upstox/connection');
    const pass = res.status === 200 && res.data.connected === false &&
      res.data.message.includes('No access token');
    logTest('GET /api/upstox/connection - returns disconnected without token', pass,
      pass ? '' : `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
    return pass;
  } catch (e) {
    logTest('GET /api/upstox/connection - returns disconnected without token', false, e.message);
    return false;
  }
}

// --- FULL PIPELINE TEST ---
async function testFullPipeline(db) {
  console.log('\n--- FULL PIPELINE TEST ---');
  
  try {
    // Step 1: Initialize
    const initRes = await request('POST', '/api/initialize');
    if (initRes.data.status !== 'success') {
      logTest('PIPELINE: Initialize', false, 'Initialize failed');
      return false;
    }
    console.log('  1. Initialize: OK');

    // Step 2: Fetch news
    const newsRes = await request('GET', '/api/news/fetch', null, 30000);
    if (newsRes.data.status !== 'success' || newsRes.data.articles_processed === 0) {
      logTest('PIPELINE: Fetch news', false, 'News fetch failed');
      return false;
    }
    console.log(`  2. News fetch: OK (${newsRes.data.articles_processed} articles)`);

    // Step 3: Verify news stored
    const latestRes = await request('GET', '/api/news/latest');
    if (latestRes.data.count === 0) {
      logTest('PIPELINE: News stored', false, 'No news in DB');
      return false;
    }
    console.log(`  3. News stored: OK (${latestRes.data.count} in DB)`);

    // Step 4: Inject high-confidence news for trade generation
    const highConfNews = {
      id: 'TEST_HIGH_CONF_' + Date.now(),
      title: 'Market Rally Expected - Nifty to hit new highs',
      description: 'Strong FII inflows and positive global cues expected to drive markets higher',
      content: 'Experts predict continued bullish momentum',
      source: 'Test Pipeline',
      url: 'https://test.com/pipeline',
      published_at: new Date().toISOString(),
      sentiment_analysis: {
        sentiment: 'BULLISH',
        confidence: 85,
        impact: 'HIGH',
        reason: 'Strong FII inflows expected',
        trading_signal: 'BUY_CALL'
      },
      created_at: new Date().toISOString()
    };
    db.data.news_articles.push(highConfNews);
    db.save();
    console.log('  4. Injected high-confidence news: OK');

    // Step 5: Generate trade
    const tradeRes = await request('POST', '/api/test/generate-trade');
    if (tradeRes.data.status !== 'success') {
      logTest('PIPELINE: Generate trade', false, `Trade generation failed: ${tradeRes.data.message}`);
      return false;
    }
    console.log('  5. Trade generated: OK');

    // Step 6: Verify signal created
    const sigRes = await request('GET', '/api/signals/active');
    if (sigRes.data.count === 0) {
      logTest('PIPELINE: Signal created', false, 'No active signals');
      return false;
    }
    console.log(`  6. Signal created: OK (${sigRes.data.count} active)`);

    // Step 7: Verify trade created
    const activeRes = await request('GET', '/api/trades/active');
    if (activeRes.data.count === 0) {
      logTest('PIPELINE: Trade created', false, 'No active trades');
      return false;
    }
    console.log(`  7. Trade active: OK (${activeRes.data.count} open trades)`);

    // Step 8: Test auto-exit check
    const exitRes = await request('POST', '/api/auto-exit/check');
    if (exitRes.data.status !== 'success') {
      logTest('PIPELINE: Auto-exit check', false, 'Auto-exit check failed');
      return false;
    }
    console.log(`  8. Auto-exit check: OK (${exitRes.data.exits_executed} exits)`);

    logTest('FULL PIPELINE: fetch news -> generate signal -> execute trade -> auto-exit', true, '');
    return true;
  } catch (e) {
    logTest('FULL PIPELINE: fetch news -> generate signal -> execute trade -> auto-exit', false, e.message);
    return false;
  }
}

// ============ MAIN TEST RUNNER ============
async function runTests() {
  console.log('='.repeat(60));
  console.log('AI Trading Bot - Node.js Backend API Test Suite');
  console.log('='.repeat(60));
  console.log(`Test Server: ${BASE_URL}`);
  console.log('');

  // Create Express app with routes
  const db = new JsonDatabase();
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Load all route modules
  console.log('Loading route modules...');
  try {
    const settingsRoutes = require('./routes/settings')(db);
    const portfolioRoutes = require('./routes/portfolio')(db);
    const newsRoutes = require('./routes/news')(db);
    const tradingRoutes = require('./routes/trading')(db);
    const upstoxRoutes = require('./routes/upstox')(db);

    app.use(settingsRoutes);
    app.use(portfolioRoutes);
    app.use(newsRoutes);
    app.use(tradingRoutes);
    app.use(upstoxRoutes);
    console.log('✅ All 5 route modules loaded successfully\n');
  } catch (e) {
    console.error('❌ Failed to load routes:', e.message);
    process.exit(1);
  }

  // Start server
  const server = app.listen(TEST_PORT, '127.0.0.1', async () => {
    console.log(`Test server running on port ${TEST_PORT}\n`);

    // Reset DB before tests
    db.reset();

    // Run all tests
    console.log('--- SETTINGS TESTS ---');
    await testGetSettings();
    await testUpdateSettings();
    await testUpdateSettingsRiskValidation();
    await testUpdateSettingsMinTradeValidation();
    await testTradingStatus();

    // Reset for portfolio tests
    db.reset();
    console.log('\n--- PORTFOLIO TESTS ---');
    await testInitialize();
    await testGetPortfolio();
    await testGetStats();
    await testCombinedStatus();

    console.log('\n--- NEWS TESTS ---');
    await testNewsFetch();
    await testNewsLatest();

    console.log('\n--- TRADING/SIGNALS TESTS ---');
    await testSignalsLatest();
    await testSignalsActive();
    await testTradesActive();
    await testTradesToday();
    await testTradesHistory();
    await testAutoExitCheck();
    await testAutoSettingsUpdate();
    await testAutoSettingsGet();
    await testGenerateTrade();

    console.log('\n--- UPSTOX TESTS ---');
    await testUpstoxAuthUrl();
    await testUpstoxConnection();

    // Full pipeline test
    db.reset();
    await testFullPipeline(db);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total: ${results.total}`);
    console.log(`Passed: ${results.passed} ✅`);
    console.log(`Failed: ${results.failed} ❌`);
    console.log(`Success Rate: ${Math.round((results.passed / results.total) * 100)}%`);
    console.log('='.repeat(60));

    // Write results to file
    const reportPath = '/app/test_reports/nodejs_api_results.json';
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to: ${reportPath}`);

    // Close server
    server.close(() => {
      process.exit(results.failed > 0 ? 1 : 0);
    });
  });

  server.on('error', (e) => {
    console.error('Server error:', e.message);
    process.exit(1);
  });
}

// Run tests
runTests().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
