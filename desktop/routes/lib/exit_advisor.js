/**
 * AI Exit Advisor Module
 * Analyzes open trades every 3 min and provides real-time exit recommendations.
 * Uses GPT-4o to analyze market conditions, news sentiment, price action, and Greeks.
 */
let OpenAI;
try { OpenAI = require('openai'); } catch (_) { OpenAI = null; }

let advisorState = {
  running: false,
  intervalId: null,
  last_check: null,
  check_count: 0,
  active_advice: {}, // trade_id -> advice
};

function isMarketHours() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const day = ist.getUTCDay();
  const hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  const timeMinutes = hours * 60 + minutes;
  if (day === 0 || day === 6) return false;
  return timeMinutes >= 555 && timeMinutes <= 930; // 9:15 AM - 3:30 PM
}

async function analyzeTradeForExit(trade, db) {
  const apiKey = db.data?.settings?.ai?.emergent_llm_key || '';
  if (!OpenAI || !apiKey) {
    return buildBasicAdvice(trade, db);
  }

  try {
    const client = new OpenAI({ apiKey, baseURL: 'https://integrations.emergentagent.com/llm' });

    // Gather context
    const recentNews = (db.data?.news_articles || []).slice(-5).map(n => `[${n.source}] ${n.title} (${n.sentiment_analysis?.sentiment || 'N/A'} ${n.sentiment_analysis?.confidence || 0}%)`).join('\n');
    const marketData = db.data?.market_data?.indices || {};
    const nifty = marketData.nifty50?.value || 0;
    const bnf = marketData.banknifty?.value || 0;
    const pnlPct = trade.pnl_percentage || ((trade.current_price - trade.entry_price) / trade.entry_price * 100) || 0;
    const holdTime = trade.entry_time ? Math.round((Date.now() - new Date(trade.entry_time).getTime()) / 60000) : 0;

    const tradeContext = `
OPEN TRADE ANALYSIS:
- Symbol: ${trade.symbol}
- Type: ${trade.trade_type} (${trade.trade_type === 'CALL' || trade.trade_type === 'BUY' ? 'Bullish' : 'Bearish'} position)
- Entry Price: ₹${trade.entry_price}
- Current Price: ₹${trade.current_price || trade.entry_price}
- P&L: ₹${Math.round(trade.live_pnl || 0)} (${pnlPct.toFixed(1)}%)
- Stop Loss: ₹${trade.stop_loss || 'Not set'}
- Target: ₹${trade.target || 'Not set'}
- Hold Time: ${holdTime} minutes
- Quantity: ${trade.quantity}
- Investment: ₹${trade.investment || 0}

MARKET CONTEXT:
- Nifty: ${nifty} | BankNifty: ${bnf}
- Market Data Updated: ${db.data?.market_data?.last_updated || 'Unknown'}

RECENT NEWS (last 5):
${recentNews || 'No recent news'}`;

    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert options trading exit advisor for Indian markets. Analyze the open trade and provide a clear recommendation. Respond ONLY in this JSON format:
{
  "action": "HOLD" or "EXIT_NOW" or "PARTIAL_EXIT" or "TIGHTEN_SL",
  "confidence": 60-95,
  "reason": "1-2 line reason in Hinglish",
  "risk_level": "LOW" or "MEDIUM" or "HIGH",
  "suggested_sl": null or number (new SL if TIGHTEN_SL),
  "exit_pct": null or number (% to exit if PARTIAL_EXIT, e.g. 50)
}
Be decisive. If P&L is near target, suggest EXIT_NOW. If trend reversing, suggest EXIT_NOW. If profitable but trend strong, suggest TIGHTEN_SL. If just entered and no clear signal, suggest HOLD.`
        },
        { role: 'user', content: tradeContext },
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    const responseText = completion.choices?.[0]?.message?.content || '';
    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const advice = JSON.parse(jsonMatch[0]);
      return {
        ...advice,
        trade_id: trade.id || trade.instrument_token,
        symbol: trade.symbol,
        timestamp: new Date().toISOString(),
        source: 'ai',
        pnl_at_advice: Math.round(trade.live_pnl || 0),
        pnl_pct_at_advice: parseFloat(pnlPct.toFixed(1)),
      };
    }
    return buildBasicAdvice(trade, db);
  } catch (e) {
    console.error(`[ExitAdvisor] AI error for ${trade.symbol}:`, e.message);
    return buildBasicAdvice(trade, db);
  }
}

function buildBasicAdvice(trade, db) {
  const pnlPct = trade.pnl_percentage || ((trade.current_price - trade.entry_price) / trade.entry_price * 100) || 0;
  const riskCfg = db.data?.settings?.risk || {};
  const slPct = riskCfg.stop_loss_pct || 15;
  const targetPct = riskCfg.target_pct || 25;

  let action = 'HOLD';
  let reason = 'Position stable, koi strong exit signal nahi hai';
  let confidence = 50;
  let risk = 'LOW';

  if (pnlPct >= targetPct * 0.8) {
    action = 'EXIT_NOW';
    reason = `Target ke kaafi paas (${pnlPct.toFixed(1)}% profit). Book karo!`;
    confidence = 80;
    risk = 'LOW';
  } else if (pnlPct <= -slPct * 0.8) {
    action = 'EXIT_NOW';
    reason = `SL ke paas pahunch gaya (${pnlPct.toFixed(1)}% loss). Jaldi niklo!`;
    confidence = 85;
    risk = 'HIGH';
  } else if (pnlPct > 5) {
    action = 'TIGHTEN_SL';
    reason = `Profit mein hai (${pnlPct.toFixed(1)}%). SL tighten karke profit lock karo.`;
    confidence = 65;
    risk = 'MEDIUM';
    return { action, confidence, reason, risk_level: risk, suggested_sl: Math.round(trade.entry_price * 1.02), exit_pct: null, trade_id: trade.id || trade.instrument_token, symbol: trade.symbol, timestamp: new Date().toISOString(), source: 'rule', pnl_at_advice: Math.round(trade.live_pnl || 0), pnl_pct_at_advice: parseFloat(pnlPct.toFixed(1)) };
  } else if (pnlPct < -5) {
    action = 'HOLD';
    reason = `Loss mein hai (${pnlPct.toFixed(1)}%) but SL se door. Hold karo, recover ho sakta hai.`;
    confidence = 55;
    risk = 'MEDIUM';
  }

  return { action, confidence, reason, risk_level: risk, suggested_sl: null, exit_pct: null, trade_id: trade.id || trade.instrument_token, symbol: trade.symbol, timestamp: new Date().toISOString(), source: 'rule', pnl_at_advice: Math.round(trade.live_pnl || 0), pnl_pct_at_advice: parseFloat(pnlPct.toFixed(1)) };
}

async function checkAllOpenTrades(db) {
  if (!isMarketHours()) {
    advisorState.last_check = new Date().toISOString();
    return;
  }

  const openTrades = (db.data?.trades || []).filter(t => t.status === 'OPEN');
  if (openTrades.length === 0) {
    advisorState.last_check = new Date().toISOString();
    return;
  }

  console.log(`[ExitAdvisor] Checking ${openTrades.length} open trade(s)...`);

  for (const trade of openTrades) {
    try {
      const advice = await analyzeTradeForExit(trade, db);
      const tradeKey = trade.id || trade.instrument_token || trade.symbol;
      advisorState.active_advice[tradeKey] = advice;

      // Store advice in trade object too
      trade.exit_advice = advice;

      // Notify if action needed
      if (advice.action !== 'HOLD' && db.notify) {
        const emoji = advice.action === 'EXIT_NOW' ? '[EXIT]' : advice.action === 'PARTIAL_EXIT' ? '[PARTIAL]' : '[TIGHTEN SL]';
        db.notify('exit_advice', `${emoji} ${trade.symbol}`, advice.reason);
      }

      // Telegram: Exit Advice Alert (skip HOLD to avoid spam)
      const tgAlerts = db.data?.settings?.telegram?.alerts || {};
      if (tgAlerts.exit_advice !== false && advice.action !== 'HOLD') {
        const tg = require('./telegram');
        tg.sendExitAdviceAlert(trade, advice).catch(() => {});
      }

      console.log(`[ExitAdvisor] ${trade.symbol}: ${advice.action} (${advice.confidence}%) - ${advice.reason}`);
    } catch (e) {
      console.error(`[ExitAdvisor] Error checking ${trade.symbol}:`, e.message);
    }
  }

  advisorState.check_count++;
  advisorState.last_check = new Date().toISOString();
  db.save();
}

function startExitAdvisor(db) {
  if (advisorState.running) return;
  console.log('[ExitAdvisor] Starting AI Exit Advisor (3 min interval)');
  advisorState.running = true;

  // First check after 30 seconds (let market data load first)
  setTimeout(() => checkAllOpenTrades(db), 30000);

  // Then every 3 minutes
  advisorState.intervalId = setInterval(() => checkAllOpenTrades(db), 3 * 60 * 1000);
}

function stopExitAdvisor() {
  if (advisorState.intervalId) {
    clearInterval(advisorState.intervalId);
    advisorState.intervalId = null;
  }
  advisorState.running = false;
  console.log('[ExitAdvisor] Stopped');
}

function getAdvisorStatus() {
  return {
    running: advisorState.running,
    last_check: advisorState.last_check,
    check_count: advisorState.check_count,
    active_advice_count: Object.keys(advisorState.active_advice).length,
    market_hours: isMarketHours(),
  };
}

function getAdviceForTrade(tradeId) {
  return advisorState.active_advice[tradeId] || null;
}

function getAllAdvice() {
  return advisorState.active_advice;
}

module.exports = { startExitAdvisor, stopExitAdvisor, getAdvisorStatus, analyzeTradeForExit, getAdviceForTrade, getAllAdvice };
