/**
 * Morning Briefing Module
 * Sends a personalized morning market briefing to Telegram at 9:00 AM IST on weekdays.
 * Includes market data, yesterday's performance, and AI-generated outlook.
 */
const axios = require('axios');
const telegram = require('./telegram');
let OpenAI;
try { OpenAI = require('openai'); } catch (_) { OpenAI = null; }

let briefingState = {
  running: false,
  intervalId: null,
  last_sent: null,
  last_sent_date: null, // prevent duplicate sends on same day
  sent_count: 0,
};

function getISTNow() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffset);
}

function isBriefingTime() {
  const ist = getISTNow();
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false; // Skip weekends
  const hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  // Send between 9:00 - 9:10 AM IST
  return hours === 9 && minutes >= 0 && minutes <= 10;
}

function getTodayDateStr() {
  const ist = getISTNow();
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
}

async function getAIOutlook(db, marketSummary) {
  const apiKey = db.data?.settings?.ai?.emergent_llm_key || '';
  if (!OpenAI || !apiKey) return null;

  try {
    const client = new OpenAI({ apiKey, baseURL: 'https://integrations.emergentagent.com/llm' });

    const recentNews = (db.data?.news_articles || []).slice(-8).map(n =>
      `[${n.source}] ${n.title} (${n.sentiment_analysis?.sentiment || 'N/A'})`
    ).join('\n');

    const prompt = `You are an Indian stock market morning briefing expert. Based on the data below, give a brief 2-3 line market outlook for today in Hinglish (Hindi + English mix). Be specific about sectors, levels, and actionable.

MARKET DATA:
${marketSummary}

RECENT NEWS:
${recentNews || 'No recent news available'}

Respond with ONLY the outlook text, no formatting or labels. Keep it under 150 words.`;

    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    });

    return completion.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error('[Briefing] AI outlook error:', e.message);
    return null;
  }
}

async function sendMorningBriefing(db) {
  const todayStr = getTodayDateStr();

  // Already sent today?
  if (briefingState.last_sent_date === todayStr) return;

  if (!telegram.getStatus().configured) return;

  const alerts = db.data?.settings?.telegram?.alerts || {};
  if (alerts.morning_briefing === false) return;

  try {
    // Get user name
    const userName = db.data?.settings?.telegram?.name || 'Trader';
    const firstName = userName.split(' ')[0];

    // Get market data
    const indices = db.data?.market_data?.indices || {};
    const nifty = indices.nifty50 || {};
    const bnf = indices.banknifty || {};
    const sensex = indices.sensex || {};

    // Yesterday's performance
    const yesterday = new Date(getISTNow());
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const mode = db.data?.settings?.trading_mode || 'PAPER';
    const yesterdayTrades = (db.data?.trades || []).filter(t =>
      t.status === 'CLOSED' && (t.exit_time || '').startsWith(yesterdayStr) && (t.mode || 'PAPER') === mode
    );
    const totalPnl = yesterdayTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    const wins = yesterdayTrades.filter(t => (t.pnl || 0) > 0).length;
    const losses = yesterdayTrades.filter(t => (t.pnl || 0) <= 0).length;
    const yesterdaySignals = (db.data?.signals || []).filter(s =>
      (s.created_at || '').startsWith(yesterdayStr)
    ).length;

    // Open positions
    const openTrades = (db.data?.trades || []).filter(t => t.status === 'OPEN').length;

    // AI Guards status
    const guards = db.data?.settings?.ai_guards || {};
    const activeGuards = ['multi_timeframe', 'market_regime_filter', 'trailing_stop', 'multi_source_verification', 'time_of_day_filter', 'max_daily_loss', 'kelly_sizing', 'greeks_filter'].filter(g => guards[g] !== false).length;

    // Build market summary for AI
    const marketSummary = `Nifty: ${nifty.value || 'N/A'} (${nifty.changePct >= 0 ? '+' : ''}${nifty.changePct || 0}%)
BankNifty: ${bnf.value || 'N/A'} (${bnf.changePct >= 0 ? '+' : ''}${bnf.changePct || 0}%)
Yesterday: ${yesterdayTrades.length} trades, ${wins}W/${losses}L, P&L: ${totalPnl >= 0 ? '+' : ''}₹${Math.round(totalPnl)}
Open positions: ${openTrades}
Mode: ${mode}`;

    // Get AI outlook
    const aiOutlook = await getAIOutlook(db, marketSummary);

    // Format message
    const changeEmoji = (nifty.changePct || 0) >= 0 ? '\u{1F7E2}' : '\u{1F534}';
    const bnfEmoji = (bnf.changePct || 0) >= 0 ? '\u{1F7E2}' : '\u{1F534}';

    let message = `\u{2600}\u{FE0F} <b>Good Morning ${firstName}!</b>\n\n`;

    // Market data
    message += `\u{1F4CA} <b>Market Status:</b>\n`;
    if (nifty.value) message += `${changeEmoji} Nifty: <b>${nifty.value.toLocaleString('en-IN')}</b> (${nifty.changePct >= 0 ? '+' : ''}${nifty.changePct}%)\n`;
    if (bnf.value) message += `${bnfEmoji} BankNifty: <b>${bnf.value.toLocaleString('en-IN')}</b> (${bnf.changePct >= 0 ? '+' : ''}${bnf.changePct}%)\n`;
    if (sensex.value) message += `Sensex: <b>${sensex.value.toLocaleString('en-IN')}</b> (${sensex.changePct >= 0 ? '+' : ''}${sensex.changePct}%)\n`;

    // Yesterday's performance
    message += `\n\u{1F4B0} <b>Yesterday (${mode}):</b>\n`;
    if (yesterdayTrades.length > 0) {
      message += `Trades: ${yesterdayTrades.length} (${wins}W / ${losses}L)\n`;
      message += `P&L: ${totalPnl >= 0 ? '+' : ''}\u20B9${Math.round(totalPnl)}\n`;
    } else {
      message += `No trades yesterday\n`;
    }
    if (yesterdaySignals > 0) message += `Signals: ${yesterdaySignals}\n`;

    // Open positions
    if (openTrades > 0) {
      message += `\n\u{26A0}\u{FE0F} <b>Open Positions: ${openTrades}</b>\n`;
    }

    // AI Outlook
    message += `\n\u{1F916} <b>AI Outlook:</b>\n`;
    if (aiOutlook) {
      message += `${aiOutlook}\n`;
    } else {
      message += `Market analysis chal raha hai. Signals aate hi alert milega.\n`;
    }

    // Guards status
    message += `\n\u{1F6E1} Guards: ${activeGuards}/8 active | Mode: ${mode}`;
    message += `\n\n<i>Have a profitable day! \u{1F4AA}</i>`;

    const result = await telegram.sendMessage(message);

    if (result.ok) {
      briefingState.last_sent = new Date().toISOString();
      briefingState.last_sent_date = todayStr;
      briefingState.sent_count++;
      console.log(`[Briefing] Morning briefing #${briefingState.sent_count} sent to ${firstName}`);
    } else {
      console.error('[Briefing] Failed to send:', result.error);
    }
  } catch (e) {
    console.error('[Briefing] Error:', e.message);
  }
}

function startMorningBriefing(db) {
  if (briefingState.running) return;
  console.log('[Briefing] Starting morning briefing scheduler (checks every 60s)');
  briefingState.running = true;

  // Check every minute if it's briefing time
  briefingState.intervalId = setInterval(() => {
    if (isBriefingTime()) {
      sendMorningBriefing(db);
    }
  }, 60000);
}

function stopMorningBriefing() {
  if (briefingState.intervalId) {
    clearInterval(briefingState.intervalId);
    briefingState.intervalId = null;
  }
  briefingState.running = false;
}

function getBriefingStatus() {
  return {
    running: briefingState.running,
    last_sent: briefingState.last_sent,
    last_sent_date: briefingState.last_sent_date,
    sent_count: briefingState.sent_count,
    is_briefing_time: isBriefingTime(),
    next_briefing: 'Weekdays 9:00 AM IST',
  };
}

module.exports = { startMorningBriefing, stopMorningBriefing, getBriefingStatus, sendMorningBriefing };
