const { Router } = require('express');

module.exports = function (db) {
  const router = Router();

  function getDefaults() {
    return {
      type: 'main',
      trading_mode: 'PAPER',
      ai: { emergent_llm_key: '', model: 'gpt-4o', provider: 'openai' },
      broker: { name: 'upstox', api_key: '', api_secret: '', redirect_uri: '', access_token: '', token_timestamp: '' },
      risk: { initial_capital: 500000, daily_limit: 100000, max_per_trade: 20000, stop_loss_pct: 25, target_pct: 50, risk_tolerance: 'medium' },
      auto_trading: { auto_exit: true, auto_entry: false, auto_analysis: true, analysis_interval_minutes: 5 },
      schedule: { enabled: true, trading_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], start_time: '09:15', end_time: '15:30', timezone: 'Asia/Kolkata' },
      news: { sources: ['demo'], newsapi_key: '', alphavantage_key: '', min_confidence: 60 },
      notifications: { enabled: true, trade_execution: true, high_confidence_signals: true, risk_warnings: true, daily_summary: true },
    };
  }

  function ensureSettings() {
    if (!db.data.settings || !db.data.settings.type) {
      db.data.settings = getDefaults();
      db.save();
    }
    return db.data.settings;
  }

  // GET /api/settings
  router.get('/api/settings', (req, res) => {
    const settings = ensureSettings();
    res.json({ status: 'success', settings });
  });

  // POST /api/settings/update
  router.post('/api/settings/update', (req, res) => {
    const body = req.body || {};
    const settings = ensureSettings();

    // Validate risk
    if (body.risk) {
      if (body.risk.daily_limit < body.risk.max_per_trade) {
        return res.json({ status: 'error', message: 'Daily limit must be greater than max per trade' });
      }
      if (body.risk.max_per_trade < 1000) {
        return res.json({ status: 'error', message: 'Max per trade must be at least 1,000' });
      }
    }

    // Deep merge
    for (const key of Object.keys(body)) {
      if (typeof body[key] === 'object' && body[key] !== null && !Array.isArray(body[key])) {
        settings[key] = { ...(settings[key] || {}), ...body[key] };
      } else {
        settings[key] = body[key];
      }
    }
    if (!settings.type) settings.type = 'main';

    // SYNC: If risk settings changed, also update auto_trading settings
    if (body.risk) {
      if (!settings.auto_trading) settings.auto_trading = {};
      if (body.risk.target_pct != null) settings.auto_trading.target_pct = body.risk.target_pct;
      if (body.risk.stop_loss_pct != null) settings.auto_trading.stoploss_pct = body.risk.stop_loss_pct;
    }

    db.data.settings = settings;
    db.save();
    res.json({ status: 'success', settings });
  });

  // GET /api/settings/trading-status
  router.get('/api/settings/trading-status', (req, res) => {
    const settings = ensureSettings();
    const schedule = settings.schedule || {};

    if (!schedule.enabled) {
      return res.json({ status: 'success', allowed: true, reason: 'Schedule disabled' });
    }

    // IST offset +5:30
    const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[now.getUTCDay()];
    const tradingDays = schedule.trading_days || [];

    if (!tradingDays.includes(currentDay)) {
      return res.json({ status: 'success', allowed: false, reason: `No trading on ${currentDay}` });
    }

    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;
    const start = schedule.start_time || '09:15';
    const end = schedule.end_time || '15:30';

    if (currentTime < start || currentTime > end) {
      return res.json({ status: 'success', allowed: false, reason: `Outside trading hours (${start}-${end})` });
    }

    res.json({ status: 'success', allowed: true, reason: 'Trading time' });
  });

  // POST /api/emergency-stop
  router.post('/api/emergency-stop', (req, res) => {
    const { active } = req.body || {};
    const settings = ensureSettings();
    settings.emergency_stop = !!active;
    // When emergency stop is ON, also disable auto_entry
    if (active) {
      if (!settings.auto_trading) settings.auto_trading = {};
      settings.auto_trading.auto_entry = false;
    }
    db.data.settings = settings;
    db.save();
    console.log(`[EMERGENCY STOP] ${active ? 'ACTIVATED' : 'DEACTIVATED'}`);
    res.json({ status: 'success', emergency_stop: settings.emergency_stop });
  });

  return router;
};
