/**
 * Telegram Notifications Module
 * Sends trading alerts via Telegram bot.
 * Auto-discovers chat ID when user sends /start.
 */
const axios = require('axios');

let telegramState = {
  configured: false,
  chat_id: null,
  bot_token: null,
  last_sent: null,
  sent_count: 0,
  errors: [],
  polling: false,
};

function configure(botToken, chatId) {
  telegramState.bot_token = botToken;
  telegramState.chat_id = chatId;
  telegramState.configured = !!(botToken && chatId);
}

function getStatus() {
  return {
    configured: telegramState.configured,
    has_token: !!telegramState.bot_token,
    has_chat_id: !!telegramState.chat_id,
    chat_id: telegramState.chat_id,
    last_sent: telegramState.last_sent,
    sent_count: telegramState.sent_count,
    recent_errors: telegramState.errors.slice(-3),
  };
}

async function sendMessage(text, parseMode = 'HTML') {
  if (!telegramState.configured) return { ok: false, error: 'Not configured' };
  try {
    const resp = await axios.post(
      `https://api.telegram.org/bot${telegramState.bot_token}/sendMessage`,
      { chat_id: telegramState.chat_id, text, parse_mode: parseMode, disable_web_page_preview: true },
      { timeout: 10000 }
    );
    telegramState.last_sent = new Date().toISOString();
    telegramState.sent_count++;
    return { ok: true };
  } catch (e) {
    const err = e.response?.data?.description || e.message;
    telegramState.errors.push({ time: new Date().toISOString(), error: err });
    if (telegramState.errors.length > 10) telegramState.errors = telegramState.errors.slice(-10);
    console.error('[Telegram] Send error:', err);
    return { ok: false, error: err };
  }
}

// Auto-discover chat ID by polling for /start messages
async function discoverChatId(botToken) {
  try {
    const resp = await axios.get(`https://api.telegram.org/bot${botToken}/getUpdates`, {
      params: { timeout: 5, offset: -10 }, timeout: 15000,
    });
    if (resp.data?.ok && resp.data.result?.length > 0) {
      // Find the most recent /start message
      for (let i = resp.data.result.length - 1; i >= 0; i--) {
        const msg = resp.data.result[i].message;
        if (msg?.chat?.id) {
          return { chat_id: msg.chat.id, name: `${msg.chat.first_name || ''} ${msg.chat.last_name || ''}`.trim(), username: msg.chat.username || '' };
        }
      }
    }
    return null;
  } catch (e) {
    console.error('[Telegram] Discovery error:', e.message);
    return null;
  }
}

// ============ Alert Formatters ============

function formatSignalAlert(signal) {
  const emoji = signal.trade_type === 'CALL' ? '\u{1F7E2}' : '\u{1F534}';
  const direction = signal.trade_type === 'CALL' ? 'BULLISH' : 'BEARISH';
  return `${emoji} <b>NEW SIGNAL: ${signal.trade_type}</b>

<b>Instrument:</b> ${signal.instrument || signal.symbol || 'N/A'}
<b>Direction:</b> ${direction}
<b>Confidence:</b> ${signal.confidence || 0}%
<b>Entry:</b> \u20B9${signal.entry_price || 0}
<b>Target:</b> \u20B9${signal.target || 0}
<b>Stop Loss:</b> \u20B9${signal.stop_loss || 0}
${signal.reason ? `<b>Reason:</b> ${signal.reason}` : ''}
${signal.kelly_sizing ? `<b>Kelly:</b> ${signal.kelly_sizing.kelly_pct}% (${signal.kelly_sizing.mode})` : ''}`;
}

function formatTradeEntry(trade) {
  const emoji = trade.trade_type === 'CALL' || trade.trade_type === 'BUY' ? '\u{1F7E2}' : '\u{1F534}';
  return `${emoji} <b>TRADE ENTRY</b>

<b>Symbol:</b> ${trade.symbol}
<b>Type:</b> ${trade.trade_type}
<b>Qty:</b> ${trade.quantity}
<b>Entry:</b> \u20B9${trade.entry_price}
<b>Investment:</b> \u20B9${trade.investment || 0}
<b>Target:</b> \u20B9${trade.target || 0}
<b>SL:</b> \u20B9${trade.stop_loss || 0}
<b>Mode:</b> ${trade.mode || 'PAPER'}`;
}

function formatTradeExit(trade) {
  const pnl = trade.pnl || trade.live_pnl || 0;
  const emoji = pnl >= 0 ? '\u{2705}' : '\u{274C}';
  const pnlPct = trade.pnl_percentage || 0;
  return `${emoji} <b>TRADE EXIT</b>

<b>Symbol:</b> ${trade.symbol}
<b>Entry:</b> \u20B9${trade.entry_price} \u2192 <b>Exit:</b> \u20B9${trade.exit_price || trade.current_price || 0}
<b>P&L:</b> ${pnl >= 0 ? '+' : ''}\u20B9${Math.round(pnl)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)
<b>Exit Reason:</b> ${trade.exit_reason || 'Manual'}`;
}

function formatDailySummary(summary) {
  const emoji = summary.total_pnl >= 0 ? '\u{1F4C8}' : '\u{1F4C9}';
  return `${emoji} <b>DAILY P&L SUMMARY</b>

<b>Total P&L:</b> ${summary.total_pnl >= 0 ? '+' : ''}\u20B9${Math.round(summary.total_pnl)}
<b>Trades:</b> ${summary.total_trades} (${summary.wins}W / ${summary.losses}L)
<b>Win Rate:</b> ${summary.win_rate}%
<b>Biggest Win:</b> +\u20B9${Math.round(summary.biggest_win || 0)}
<b>Biggest Loss:</b> -\u20B9${Math.abs(Math.round(summary.biggest_loss || 0))}
<b>Mode:</b> ${summary.mode || 'PAPER'}`;
}

function formatGuardBlock(guardName, reason) {
  return `\u{1F6E1} <b>AI GUARD BLOCKED</b>

<b>Guard:</b> ${guardName}
<b>Reason:</b> ${reason}`;
}

function formatExitAdvice(trade, advice) {
  const actionEmoji = {
    HOLD: '\u{1F535}', EXIT_NOW: '\u{1F534}', PARTIAL_EXIT: '\u{1F7E0}', TIGHTEN_SL: '\u{1F7E1}',
  };
  const emoji = actionEmoji[advice.action] || '\u{2139}';
  return `${emoji} <b>EXIT ADVISOR: ${advice.action.replace('_', ' ')}</b>

<b>Symbol:</b> ${trade.symbol}
<b>Current P&L:</b> ${advice.pnl_at_advice >= 0 ? '+' : ''}\u20B9${advice.pnl_at_advice} (${advice.pnl_pct_at_advice >= 0 ? '+' : ''}${advice.pnl_pct_at_advice}%)
<b>Confidence:</b> ${advice.confidence}%
<b>Risk:</b> ${advice.risk_level}
<b>Reason:</b> ${advice.reason}
${advice.suggested_sl ? `<b>New SL:</b> \u20B9${advice.suggested_sl}` : ''}${advice.exit_pct ? `<b>Exit:</b> ${advice.exit_pct}% qty` : ''}`;
}

// ============ Alert Senders ============

async function sendSignalAlert(signal) {
  return sendMessage(formatSignalAlert(signal));
}

async function sendTradeEntryAlert(trade) {
  return sendMessage(formatTradeEntry(trade));
}

async function sendTradeExitAlert(trade) {
  return sendMessage(formatTradeExit(trade));
}

async function sendDailySummary(summary) {
  return sendMessage(formatDailySummary(summary));
}

async function sendGuardBlockAlert(guardName, reason) {
  return sendMessage(formatGuardBlock(guardName, reason));
}

async function sendExitAdviceAlert(trade, advice) {
  if (advice.action === 'HOLD') return { ok: true, skipped: true }; // Don't spam HOLD
  return sendMessage(formatExitAdvice(trade, advice));
}

module.exports = {
  configure, getStatus, sendMessage, discoverChatId,
  sendSignalAlert, sendTradeEntryAlert, sendTradeExitAlert,
  sendDailySummary, sendGuardBlockAlert, sendExitAdviceAlert,
};
