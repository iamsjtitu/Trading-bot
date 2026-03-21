/**
 * Telegram Routes
 * Setup, test, and manage Telegram notifications.
 */
const { Router } = require('express');
const telegram = require('./lib/telegram');

module.exports = (db) => {
  const router = Router();

  // Initialize telegram from saved settings
  const savedTg = db.data?.settings?.telegram || {};
  if (savedTg.bot_token && savedTg.chat_id) {
    telegram.configure(savedTg.bot_token, savedTg.chat_id);
    console.log('[Telegram] Loaded saved config - chat_id:', savedTg.chat_id);
  }

  // GET /api/telegram/status
  router.get('/api/telegram/status', (req, res) => {
    const status = telegram.getStatus();
    const alerts = db.data?.settings?.telegram?.alerts || {
      signals: true, trade_entry: true, trade_exit: true,
      daily_summary: true, guard_blocks: true, exit_advice: true,
    };
    res.json({ status: 'success', telegram: status, alerts });
  });

  // POST /api/telegram/setup - Configure bot token and discover chat ID
  router.post('/api/telegram/setup', async (req, res) => {
    const { bot_token } = req.body;
    if (!bot_token) return res.json({ status: 'error', message: 'bot_token required' });

    try {
      // Verify bot token
      const axios = require('axios');
      const botInfo = await axios.get(`https://api.telegram.org/bot${bot_token}/getMe`, { timeout: 10000 });
      if (!botInfo.data?.ok) return res.json({ status: 'error', message: 'Invalid bot token' });

      // Try to discover chat ID
      const discovered = await telegram.discoverChatId(bot_token);

      if (discovered) {
        telegram.configure(bot_token, discovered.chat_id);

        // Save to DB
        if (!db.data.settings.telegram) db.data.settings.telegram = {};
        db.data.settings.telegram.bot_token = bot_token;
        db.data.settings.telegram.chat_id = discovered.chat_id;
        db.data.settings.telegram.username = discovered.username;
        db.data.settings.telegram.name = discovered.name;
        if (!db.data.settings.telegram.alerts) {
          db.data.settings.telegram.alerts = {
            signals: true, trade_entry: true, trade_exit: true,
            daily_summary: true, guard_blocks: true, exit_advice: true,
          };
        }
        db.save();

        // Send welcome message
        await telegram.sendMessage('\u{2705} <b>AI Trading Bot Connected!</b>\n\nAb aapko yahan sabhi trading alerts milenge:\n\u{1F4CA} New Signals\n\u{1F4B0} Trade Entry/Exit\n\u{1F4C8} Daily P&L Summary\n\u{1F6E1} Guard Blocks\n\u{1F916} Exit Advisor');

        res.json({
          status: 'success',
          message: 'Telegram connected!',
          bot: botInfo.data.result,
          chat_id: discovered.chat_id,
          name: discovered.name,
        });
      } else {
        // Save token, wait for chat ID
        if (!db.data.settings.telegram) db.data.settings.telegram = {};
        db.data.settings.telegram.bot_token = bot_token;
        db.save();

        res.json({
          status: 'pending',
          message: 'Bot verified but no chat found. Please send /start to your bot on Telegram, then call /api/telegram/discover',
          bot: botInfo.data.result,
        });
      }
    } catch (e) {
      res.json({ status: 'error', message: e.message });
    }
  });

  // POST /api/telegram/discover - Retry chat ID discovery
  router.post('/api/telegram/discover', async (req, res) => {
    const botToken = db.data?.settings?.telegram?.bot_token;
    if (!botToken) return res.json({ status: 'error', message: 'Bot token not configured. Call /api/telegram/setup first.' });

    const discovered = await telegram.discoverChatId(botToken);
    if (discovered) {
      telegram.configure(botToken, discovered.chat_id);
      db.data.settings.telegram.chat_id = discovered.chat_id;
      db.data.settings.telegram.name = discovered.name;
      db.data.settings.telegram.username = discovered.username;
      db.save();

      await telegram.sendMessage('\u{2705} <b>AI Trading Bot Connected!</b>\n\nAb aapko yahan sabhi trading alerts milenge!');

      res.json({ status: 'success', chat_id: discovered.chat_id, name: discovered.name });
    } else {
      res.json({ status: 'error', message: 'No messages found. Please send /start to your bot first.' });
    }
  });

  // POST /api/telegram/test - Send test message
  router.post('/api/telegram/test', async (req, res) => {
    const result = await telegram.sendMessage('\u{1F9EA} <b>Test Alert</b>\n\nYeh test message hai. Trading alerts is tarah aayenge!');
    res.json({ status: result.ok ? 'success' : 'error', message: result.ok ? 'Test message sent!' : result.error });
  });

  // POST /api/telegram/alerts - Update alert preferences
  router.post('/api/telegram/alerts', (req, res) => {
    const { alerts } = req.body;
    if (!alerts) return res.json({ status: 'error', message: 'alerts object required' });

    if (!db.data.settings.telegram) db.data.settings.telegram = {};
    db.data.settings.telegram.alerts = {
      ...db.data.settings.telegram.alerts,
      ...alerts,
    };
    db.save();

    res.json({ status: 'success', alerts: db.data.settings.telegram.alerts });
  });

  return router;
};
