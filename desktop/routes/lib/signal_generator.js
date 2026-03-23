/**
 * Signal Generator Module
 * Generates trading signals from news sentiment and executes paper/live trades.
 */
const axios = require('axios');
const crypto = require('crypto');
const { getSignalPositionSize } = require('./position_sizing');
const { blackScholes, calcIV, getDaysToExpiry, analyzeOption } = require('./greeks');
const telegram = require('./telegram');
function uuid() { return crypto.randomUUID(); }

// Helper: Send Telegram guard block alert
function notifyGuardBlock(db, guardName, reason) {
  const tgAlerts = db.data?.settings?.telegram?.alerts || {};
  if (tgAlerts.guard_blocks !== false) {
    telegram.sendGuardBlockAlert(guardName, reason).catch(() => {});
  }
}

const INSTRUMENTS = {
  NIFTY50: { base_price: 24000, strike_step: 50 },
  BANKNIFTY: { base_price: 52000, strike_step: 100 },
  FINNIFTY: { base_price: 23800, strike_step: 50 },
  MIDCPNIFTY: { base_price: 12000, strike_step: 25 },
  SENSEX: { base_price: 79800, strike_step: 100 },
  BANKEX: { base_price: 55000, strike_step: 100 },
};

const INST_KEY_MAP = {
  'NIFTY50': 'NSE_INDEX|Nifty 50', 'BANKNIFTY': 'NSE_INDEX|Nifty Bank',
  'FINNIFTY': 'NSE_INDEX|Nifty Fin Service', 'MIDCPNIFTY': 'NSE_INDEX|NIFTY MID SELECT',
  'SENSEX': 'BSE_INDEX|SENSEX', 'BANKEX': 'BSE_INDEX|BANKEX',
};

const LOT_SIZE_MAP = { NIFTY50: 65, BANKNIFTY: 30, FINNIFTY: 60, MIDCPNIFTY: 120, SENSEX: 20, BANKEX: 30 };

module.exports = function createSignalGenerator(db, aiEngine) {

  function generateSignal(newsDoc) {
    const sentiment = newsDoc.sentiment_analysis || {};

    // EMERGENCY STOP CHECK - block ALL new signals
    if (db.data?.settings?.emergency_stop) {
      console.log('[Signal] BLOCKED - Emergency Stop is active');
      return null;
    }

    // ===== FEATURE 5: TIME-OF-DAY FILTER =====
    // Block trading during high-volatility open/close windows
    const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const istMins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    const istDay = ist.getUTCDay();
    const todFilter = db.data?.settings?.ai_guards?.time_of_day_filter !== false; // default ON
    if (todFilter) {
      const openStart = 555;  // 9:15 IST
      const openEnd = 585;    // 9:45 IST
      const closeStart = 900; // 15:00 IST
      const closeEnd = 930;   // 15:30 IST
      if ((istMins >= openStart && istMins <= openEnd) || (istMins >= closeStart && istMins <= closeEnd)) {
        console.log(`[Signal] BLOCKED by Time-of-Day Filter - IST ${Math.floor(istMins/60)}:${String(istMins%60).padStart(2,'0')} is in high-volatility window`);
        notifyGuardBlock(db, 'Time-of-Day Filter', `IST ${Math.floor(istMins/60)}:${String(istMins%60).padStart(2,'0')} - High-volatility window, trading paused`);
        return null;
      }
      // Also block weekends
      if (istDay === 0 || istDay === 6) {
        console.log('[Signal] BLOCKED - Weekend, market closed');
        return null;
      }
    }

    // ===== FEATURE 6: MAX DAILY LOSS AUTO-STOP (only if enabled) =====
    const maxDailyLossEnabled = db.data?.settings?.ai_guards?.max_daily_loss !== false;
    if (maxDailyLossEnabled) {
      const maxDailyLoss = db.data?.settings?.auto_trading?.max_daily_loss || db.data?.settings?.risk?.max_daily_loss || 5000;
      const dayStartForLoss = new Date(); dayStartForLoss.setHours(0, 0, 0, 0);
      const todayClosedTrades = (db.data.trades || []).filter(t => t.status === 'CLOSED' && (t.exit_time || '') >= dayStartForLoss.toISOString());
      const todayRealizedLoss = todayClosedTrades.reduce((sum, t) => sum + Math.min(0, t.pnl || 0), 0);
      if (Math.abs(todayRealizedLoss) >= maxDailyLoss) {
        console.log(`[Signal] BLOCKED by Max Daily Loss - Today's loss: ₹${Math.abs(todayRealizedLoss)} >= limit ₹${maxDailyLoss}. Auto-stopped.`);
        if (db.notify) db.notify('risk', 'Daily Loss Limit Hit', `Today's loss ₹${Math.abs(Math.round(todayRealizedLoss))} >= ₹${maxDailyLoss}. Trading paused.`);
        notifyGuardBlock(db, 'Max Daily Loss', `Today loss ₹${Math.abs(Math.round(todayRealizedLoss))} >= limit ₹${maxDailyLoss}. Trading stopped.`);
        return null;
      }
    }

    // PROPER Call/Put mapping - only trade when signal is clear
    // SAFETY: Validate sentiment matches signal direction
    if (sentiment.trading_signal === 'BUY_CALL') {
      if (sentiment.sentiment === 'BEARISH') {
        console.log(`[Signal] MISMATCH BLOCKED - Sentiment is BEARISH but signal is BUY_CALL. Skipping.`);
        return null;
      }
    } else if (sentiment.trading_signal === 'BUY_PUT') {
      if (sentiment.sentiment === 'BULLISH') {
        console.log(`[Signal] MISMATCH BLOCKED - Sentiment is BULLISH but signal is BUY_PUT. Skipping.`);
        return null;
      }
    } else {
      // HOLD or unknown → skip, don't trade
      console.log(`[Signal] Skipping - trading_signal is ${sentiment.trading_signal} (not BUY_CALL or BUY_PUT)`);
      return null;
    }

    // MIN CONFIDENCE CHECK - Only trade when AI confidence meets user's threshold
    const minConfidence = db.data?.settings?.news?.min_confidence || 70;
    if ((sentiment.confidence || 0) < minConfidence) {
      console.log(`[Signal] BLOCKED - Confidence ${sentiment.confidence}% < min_confidence ${minConfidence}%. Skipping.`);
      return null;
    }

    // ===== FEATURE 2: AI MARKET REGIME FILTER =====
    // Block trades in SIDEWAYS/CHOPPY markets (options premium decays fast)
    const regimeFilter = db.data?.settings?.ai_guards?.market_regime_filter !== false; // default ON
    if (regimeFilter && aiEngine) {
      const regime = aiEngine.getMarketRegime ? aiEngine.getMarketRegime() : null;
      if (regime) {
        const regimeName = regime.regime || regime.name || 'UNKNOWN';
        const regimeConf = regime.confidence || 0;
        if (['SIDEWAYS', 'CHOPPY', 'RANGE_BOUND'].includes(regimeName.toUpperCase()) && regimeConf >= 60) {
          console.log(`[Signal] BLOCKED by Market Regime - ${regimeName} (${regimeConf}% confidence). Options lose value in sideways markets.`);
          if (db.notify) db.notify('risk', 'Sideways Market', `Trading paused - ${regimeName} regime detected (${regimeConf}%)`);
          notifyGuardBlock(db, 'Market Regime Filter', `${regimeName} market (${regimeConf}% confidence). Options lose value in sideways.`);
          return null;
        }
      }
    }

    // ===== FEATURE 4: MULTI-SOURCE NEWS VERIFICATION =====
    // Signal only when 2+ news sources agree on the same direction within 15 minutes
    const multiSourceCheck = db.data?.settings?.ai_guards?.multi_source_verification !== false; // default ON
    if (multiSourceCheck) {
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const recentNews = (db.data.news_articles || []).filter(n =>
        n.created_at >= fifteenMinsAgo &&
        n.id !== newsDoc.id &&
        n.sentiment_analysis &&
        n.sentiment_analysis.sentiment === sentiment.sentiment &&
        n.sentiment_analysis.confidence >= 50
      );
      // Count unique sources
      const sources = new Set(recentNews.map(n => n.source || 'unknown'));
      const currentSource = newsDoc.source || 'unknown';
      sources.add(currentSource);
      if (sources.size < 2 && (db.data.news_articles || []).length > 3) {
        console.log(`[Signal] BLOCKED by Multi-Source Check - Only ${sources.size} source(s) agree: [${[...sources].join(', ')}]. Need 2+.`);
        notifyGuardBlock(db, 'Multi-Source Verification', `Only ${sources.size} source(s) agree: [${[...sources].join(', ')}]. Need 2+ sources confirming ${sentiment.sentiment}.`);
        return null;
      }
    }

    const signalType = sentiment.trading_signal === 'BUY_CALL' ? 'CALL' : 'PUT';

    const activeInst = db.data?.settings?.trading_instrument || db.data?.settings?.active_instrument || 'NIFTY50';
    const currentMode = db.data?.settings?.trading_mode || 'PAPER';

    // MAX OPEN TRADES in selected instrument - default 5
    const maxTotalTrades = db.data?.settings?.risk?.max_open_trades || 5;
    const openInInstrument = (db.data.trades || []).filter(t => t.status === 'OPEN' && (t.instrument === activeInst || t.symbol === activeInst) && t.mode === currentMode);
    if (openInInstrument.length >= maxTotalTrades) {
      console.log(`[Signal] BLOCKED - ${activeInst} has ${openInInstrument.length}/${maxTotalTrades} open trades`);
      return null;
    }

    // AI JOURNAL CHECK - block signals for consistently losing sector+sentiment combos
    const historicalBlock = _shouldBlockFromJournal(sentiment.sector || 'BROAD_MARKET', sentiment.sentiment, signalType);
    if (historicalBlock) {
      console.log(`[Signal] BLOCKED by AI Journal - ${sentiment.sector} ${sentiment.sentiment} ${signalType} has poor track record`);
      return null;
    }

    const portfolio = db.data.portfolio || {};
    const available = portfolio.available_capital || 500000;
    const riskCfg = db.data.settings?.risk || {};
    const tolerance = riskCfg.risk_tolerance || 'medium';
    const riskParams = { low: { stop_loss_pct: 15, target_pct: 30, max_position_size: 0.03 }, medium: { stop_loss_pct: 25, target_pct: 50, max_position_size: 0.05 }, high: { stop_loss_pct: 35, target_pct: 70, max_position_size: 0.07 } };
    const rp = riskParams[tolerance] || riskParams.medium;
    // Override with user's custom SL/Target if set in risk settings
    if (riskCfg.stop_loss_pct != null && riskCfg.stop_loss_pct > 0) rp.stop_loss_pct = riskCfg.stop_loss_pct;
    if (riskCfg.target_pct != null && riskCfg.target_pct > 0) rp.target_pct = riskCfg.target_pct;
    // Also check auto_trading settings (synced from UI)
    const autoTrading = db.data?.settings?.auto_trading || {};
    if (autoTrading.stoploss_pct != null && autoTrading.stoploss_pct > 0) rp.stop_loss_pct = autoTrading.stoploss_pct;
    if (autoTrading.target_pct != null && autoTrading.target_pct > 0) rp.target_pct = autoTrading.target_pct;

    // RISK RATIO GUARD: Target MUST be >= Stop Loss for positive expectancy
    // If user set inverted ratio (e.g., SL=30%, Target=15%), enforce minimum 1:1
    if (rp.target_pct < rp.stop_loss_pct) {
      console.warn(`[Signal] WARNING: Inverted risk ratio detected! Target(${rp.target_pct}%) < StopLoss(${rp.stop_loss_pct}%). Enforcing 1:1 minimum.`);
      rp.target_pct = rp.stop_loss_pct; // At minimum, target = stoploss (1:1)
    }

    const maxTrade = autoTrading.max_per_trade || riskCfg.max_per_trade || 20000;
    const dailyLimit = autoTrading.daily_limit || riskCfg.daily_limit || 100000;

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayTrades = (db.data.trades || []).filter(t => t.entry_time >= todayStart.toISOString() && t.status === 'OPEN');
    const todayValue = todayTrades.reduce((s, t) => s + (t.investment || 0), 0);
    if (todayValue >= dailyLimit) { console.log(`[Signal] Daily limit reached: ${todayValue}/${dailyLimit}`); return null; }

    const historicalAdj = _getHistoricalAdjustment(sentiment.sector || 'BROAD_MARKET', sentiment.sentiment);
    const adjustedConfidence = sentiment.composite_score || Math.max(30, Math.min(98, (sentiment.confidence || 50) + historicalAdj));
    if (adjustedConfidence < 55) return null;

    const basePositionSize = Math.min(maxTrade, available * rp.max_position_size, dailyLimit - todayValue);
    if (basePositionSize < 1000) return null;

    const dynamicSize = aiEngine.calculateDynamicPositionSize(basePositionSize, adjustedConfidence, sentiment.sector || 'BROAD_MARKET');
    let positionSize = Math.min(dynamicSize.size, basePositionSize);
    if (positionSize < 1000) return null;

    const optionPremium = 150;
    let quantity = Math.floor(positionSize / optionPremium);
    if (quantity === 0) return null;

    // ===== KELLY CRITERION POSITION SIZING (toggleable) =====
    const kellyEnabled = db.data?.settings?.ai_guards?.kelly_sizing !== false; // default ON
    let kellySizing = null;
    if (kellyEnabled) {
      try {
        const kellyResult = getSignalPositionSize(db, { entry_price: optionPremium, lot_size: 1 }, currentMode);
        if (kellyResult && kellyResult.investment > 0) {
          const kellyQty = Math.max(1, Math.floor(kellyResult.investment / optionPremium));
          // Only reduce, never increase beyond existing logic (safety)
          if (kellyQty < quantity) {
            console.log(`[Kelly] Reducing qty from ${quantity} to ${kellyQty} (${kellyResult.kelly_pct}% kelly, ${kellyResult.streak_status})`);
            quantity = kellyQty;
            positionSize = quantity * optionPremium;
          }
          kellySizing = { kelly_pct: kellyResult.kelly_pct, mode: kellyResult.mode, streak: kellyResult.streak_status, drawdown_mult: kellyResult.drawdown_multiplier, suggested_amount: kellyResult.investment };
        }
      } catch (e) { console.log(`[Kelly] Error: ${e.message} - using default sizing`); }
    }

    // ===== GREEKS IV FILTER (toggleable) =====
    const greeksEnabled = db.data?.settings?.ai_guards?.greeks_filter !== false; // default ON
    let greeksAnalysis = null;
    if (greeksEnabled) {
      try {
        const instConfig = INSTRUMENTS[activeInst] || INSTRUMENTS.NIFTY50;
        let spotPrice = instConfig.base_price;
        // Try cached market data first
        if (db.data.market_data?.indices) {
          const idx = db.data.market_data.indices[activeInst.toLowerCase()];
          if (idx?.value > 0) spotPrice = idx.value;
          else console.log(`[Greeks] WARNING: No live spot for ${activeInst}, using fallback ${spotPrice}`);
        } else {
          console.log(`[Greeks] WARNING: No market data cached, using fallback spot ${spotPrice} for ${activeInst}`);
        }
        const strikeStep = instConfig.strike_step || 50;
        const atmStrike = Math.round(spotPrice / strikeStep) * strikeStep;
        const strikeOffset = signalType === 'CALL' ? strikeStep * 2 : -(strikeStep * 2);
        const strike = atmStrike + strikeOffset;
        const optType = signalType === 'CALL' ? 'CE' : 'PE';
        const daysToExpiry = getDaysToExpiry();
        const T = daysToExpiry / 365;

        // Smart IV estimation instead of hardcoded 15%
        // Use historical IV from recent signals if available, else use instrument-specific defaults
        let iv = 0.15;
        const recentSignalIVs = (db.data.signals || []).filter(s => s.greeks?.iv > 0).map(s => s.greeks.iv / 100).slice(-10);
        if (recentSignalIVs.length >= 3) {
          iv = recentSignalIVs.reduce((a, b) => a + b, 0) / recentSignalIVs.length;
          console.log(`[Greeks] Using avg IV from ${recentSignalIVs.length} recent signals: ${(iv * 100).toFixed(1)}%`);
        } else {
          // Instrument-specific default IVs (more realistic than flat 15%)
          const defaultIVs = { NIFTY50: 0.14, BANKNIFTY: 0.18, FINNIFTY: 0.16, MIDCPNIFTY: 0.20, SENSEX: 0.14, BANKEX: 0.18 };
          iv = defaultIVs[activeInst] || 0.15;
          // OTM options have higher IV (volatility smile)
          const moneyness = Math.abs(strike - spotPrice) / spotPrice;
          if (moneyness > 0.02) iv *= 1.15; // 2%+ OTM: add 15% IV premium
          if (moneyness > 0.04) iv *= 1.10; // 4%+ OTM: add another 10%
        }

        const greeks = blackScholes(optType, spotPrice, strike, T, 0.07, iv);
        const analysis = analyzeOption(greeks, iv, 50);
        greeksAnalysis = { delta: greeks.delta, gamma: greeks.gamma, theta: greeks.theta, vega: greeks.vega, iv: Math.round(iv * 10000) / 100, score: analysis.score, iv_signal: analysis.iv_signal, theta_signal: analysis.theta_signal, spot_used: spotPrice };

        // Block if Greeks score is too low (option is terrible)
        if (analysis.score < 25) {
          console.log(`[Greeks] BLOCKED - Score ${analysis.score}/100 too low. ${analysis.warnings.join('; ')}`);
          notifyGuardBlock(db, 'Greeks & IV Filter', `Score ${analysis.score}/100 too low. ${analysis.warnings.slice(0,2).join('; ')}`);
          return null;
        }
        // Warn but allow if score is mediocre
        if (analysis.score < 40) {
          console.log(`[Greeks] WARNING - Score ${analysis.score}/100 mediocre. Proceeding with caution.`);
        }
      } catch (e) { console.log(`[Greeks] Error: ${e.message} - skipping Greeks filter`); }
    }

    let enhancedReason = sentiment.reason || '';
    if (sentiment.correlation_score) enhancedReason += ` | Correlation: ${sentiment.correlation_score}%`;
    if (sentiment.confluence_score) enhancedReason += ` | Confluence: ${sentiment.confluence_score}%`;
    if (sentiment.market_regime && sentiment.market_regime !== 'UNKNOWN') enhancedReason += ` | Regime: ${sentiment.market_regime}`;
    if (historicalAdj !== 0) enhancedReason += ` | Historical: ${historicalAdj > 0 ? '+' : ''}${historicalAdj}`;

    const instConfig = INSTRUMENTS[activeInst] || INSTRUMENTS.NIFTY50;
    let spotPrice = instConfig.base_price;
    if (db.data.market_data?.indices) { const idx = db.data.market_data.indices[activeInst.toLowerCase()]; if (idx?.value > 0) spotPrice = idx.value; }
    const strikeStep = instConfig.strike_step || 50;
    const atmStrike = Math.round(spotPrice / strikeStep) * strikeStep;
    const strikeOffset = signalType === 'CALL' ? strikeStep * 2 : -(strikeStep * 2);

    // Generate option symbol for display (e.g., NIFTY2632424200CE)
    const now = new Date();
    const expiryStr = `${now.getFullYear().toString().slice(-2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const strike = atmStrike + strikeOffset;
    const optionSymbol = `${activeInst}${expiryStr}${strike}${signalType === 'CALL' ? 'CE' : 'PE'}`;

    return {
      id: uuid(), signal_type: signalType, symbol: activeInst,
      option_symbol: optionSymbol,
      strike_price: strike, option_premium: optionPremium, quantity, investment_amount: quantity * optionPremium, entry_price: optionPremium,
      stop_loss: Math.round(optionPremium * (1 - rp.stop_loss_pct / 100) * 100) / 100,
      target: Math.round(optionPremium * (1 + rp.target_pct / 100) * 100) / 100,
      confidence: adjustedConfidence, composite_score: sentiment.composite_score || adjustedConfidence,
      correlation_score: sentiment.correlation_score || 0, confluence_score: sentiment.confluence_score || 0,
      market_regime: sentiment.market_regime || 'UNKNOWN', sentiment: sentiment.sentiment,
      sector: sentiment.sector || 'BROAD_MARKET', secondary_sector: sentiment.secondary_sector || 'NONE',
      volatility: sentiment.volatility || 'STABLE', time_horizon: sentiment.time_horizon || 'SHORT_TERM',
      risk_level: sentiment.risk_level || 'MEDIUM', freshness_score: sentiment.freshness_score || 50,
      position_sizing: dynamicSize.factors, kelly_sizing: kellySizing, greeks: greeksAnalysis,
      reason: enhancedReason, news_id: newsDoc.id, status: 'ACTIVE',
      mode: currentMode, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
  }

  function executePaperTrade(signal) {
    if (!db.data.trades) db.data.trades = [];
    const trade = {
      id: uuid(), signal_id: signal.id, trade_type: signal.signal_type,
      symbol: signal.option_symbol || signal.symbol,
      instrument: signal.symbol || signal.instrument || 'NIFTY50',
      entry_time: new Date().toISOString(), entry_price: signal.entry_price, quantity: signal.quantity,
      investment: signal.investment_amount, stop_loss: signal.stop_loss, target: signal.target, status: 'OPEN',
      mode: db.data?.settings?.trading_mode || 'PAPER',
      sentiment: signal.sentiment || 'N/A',
      confidence: signal.confidence || 0,
      sector: signal.sector || 'BROAD_MARKET',
      exit_time: null, exit_price: null, pnl: 0, pnl_percentage: 0,
    };
    db.data.trades.push(trade);
    const p = db.data.portfolio;
    if (p) {
      p.invested_amount = (p.invested_amount || 0) + signal.investment_amount;
      p.available_capital = (p.available_capital || 0) - signal.investment_amount;
      if (!p.active_positions) p.active_positions = [];
      p.active_positions.push(trade.id);
      p.last_updated = new Date().toISOString();
    }
    db.save();

    // Telegram: Trade Entry Alert
    const tgAlerts = db.data?.settings?.telegram?.alerts || {};
    if (tgAlerts.trade_entry !== false) {
      telegram.sendTradeEntryAlert(trade).catch(() => {});
    }
  }

  async function executeLiveTrade(signal, accessToken) {
    // EMERGENCY STOP CHECK
    if (db.data?.settings?.emergency_stop) {
      console.log('[LiveTrade] BLOCKED - Emergency Stop is active');
      return { success: false, error: 'Emergency Stop is active - all trading halted' };
    }

    const headers = { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0', 'Content-Type': 'application/json' };
    try {
      const activeInst = signal.symbol || 'NIFTY50';
      // Max open trades check (respects user's max_open_trades setting)
      const maxTotalTrades = db.data?.settings?.risk?.max_open_trades || 5;
      const openInInstrument = (db.data.trades || []).filter(t => t.status === 'OPEN' && (t.instrument === activeInst || t.symbol === activeInst) && t.mode === 'LIVE');
      if (openInInstrument.length >= maxTotalTrades) {
        console.log(`[LiveTrade] BLOCKED - ${activeInst} has ${openInInstrument.length}/${maxTotalTrades} open trades`);
        return { success: false, error: `Max open trades reached (${openInInstrument.length}/${maxTotalTrades})` };
      }

      // STRICT max_per_trade enforcement — check BOTH risk and auto_trading settings
      const riskCfg = db.data?.settings?.risk || {};
      const autoTradingCfg = db.data?.settings?.auto_trading || {};
      let maxTrade = autoTradingCfg.max_per_trade || riskCfg.max_per_trade || 20000;

      // BUG FIX: Apply Kelly Criterion to LIVE trades
      // If Kelly sizing is enabled and signal has Kelly data, use Kelly's suggested amount as budget cap
      const kellyEnabled = db.data?.settings?.ai_guards?.kelly_sizing !== false;
      if (kellyEnabled && signal.kelly_sizing?.suggested_amount > 0) {
        const kellyBudget = signal.kelly_sizing.suggested_amount;
        if (kellyBudget < maxTrade) {
          console.log(`[LiveTrade] Kelly reducing budget from ₹${maxTrade} to ₹${kellyBudget} (${signal.kelly_sizing.kelly_pct}% kelly, streak: ${signal.kelly_sizing.streak})`);
          maxTrade = kellyBudget;
        }
      }

      const optionType = signal.signal_type === 'CALL' ? 'CE' : 'PE';
      const instKey = INST_KEY_MAP[activeInst] || 'NSE_INDEX|Nifty 50';

      // Get nearest expiry
      let expiryStr = '';
      let apiLotSize = 0;
      try {
        const contractResp = await axios.get('https://api.upstox.com/v2/option/contract', { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' }, params: { instrument_key: instKey }, timeout: 10000 });
        if (contractResp.data?.status === 'success' && contractResp.data?.data?.length > 0) {
          const todayStr = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().substring(0, 10);
          const expirySet = new Set();
          for (const c of contractResp.data.data) { const exp = (c.expiry || '').substring(0, 10); if (exp && exp >= todayStr) expirySet.add(exp); if (!apiLotSize && c.lot_size > 0) apiLotSize = c.lot_size; }
          const sorted = [...expirySet].sort();
          if (sorted.length > 0) expiryStr = sorted[0];
        }
      } catch (e) { console.error(`[LiveTrade] Expiry fetch failed: ${e.message}`); }
      if (!expiryStr) {
        const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        let daysToAdd = 2 - ist.getUTCDay(); if (daysToAdd < 0) daysToAdd += 7;
        if (daysToAdd === 0 && (ist.getUTCHours() * 60 + ist.getUTCMinutes()) > 930) daysToAdd = 7;
        const expiryDate = new Date(ist.getTime() + daysToAdd * 86400000);
        expiryStr = `${expiryDate.getUTCFullYear()}-${String(expiryDate.getUTCMonth() + 1).padStart(2, '0')}-${String(expiryDate.getUTCDate()).padStart(2, '0')}`;
      }

      // Find option instrument
      let instrumentToken = null;
      const searchResp = await axios.get('https://api.upstox.com/v2/option/chain', { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' }, params: { instrument_key: instKey, expiry_date: expiryStr }, timeout: 15000 }).catch(() => null);
      if (searchResp?.data?.status === 'success' && searchResp.data.data) {
        let minDiff = Infinity;
        for (const item of searchResp.data.data) {
          const opt = optionType === 'CE' ? item.call_options : item.put_options;
          if (opt?.instrument_key) { const diff = Math.abs((item.strike_price || 0) - signal.strike_price); if (diff < minDiff) { minDiff = diff; instrumentToken = opt.instrument_key; } }
        }
      }
      if (!instrumentToken) {
        const [eY, eM, eD] = expiryStr.split('-');
        const optSymbolMap = { NIFTY50: 'NIFTY', BANKNIFTY: 'BANKNIFTY', FINNIFTY: 'FINNIFTY', MIDCPNIFTY: 'MIDCPNIFTY', SENSEX: 'SENSEX', BANKEX: 'BANKEX' };
        const exchangeMap = { NIFTY50: 'NSE_FO', BANKNIFTY: 'NSE_FO', FINNIFTY: 'NSE_FO', MIDCPNIFTY: 'NSE_FO', SENSEX: 'BFO', BANKEX: 'BFO' };
        instrumentToken = `${exchangeMap[activeInst] || 'NSE_FO'}|${optSymbolMap[activeInst] || 'NIFTY'}${eY.slice(2)}${eM}${eD}${signal.strike_price}${optionType}`;
      }

      const lotSize = apiLotSize || LOT_SIZE_MAP[activeInst] || 65;

      // Get actual option premium (LTP) before calculating quantity
      let actualPremium = signal.entry_price || 150;
      try {
        if (instrumentToken) {
          const ltpResp = await axios.get(`https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodeURIComponent(instrumentToken)}`, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' }, timeout: 10000
          });
          const quotes = ltpResp.data?.data || {};
          const key = Object.keys(quotes)[0];
          if (quotes[key]?.last_price > 0) actualPremium = quotes[key].last_price;
        }
      } catch (e) { console.log(`[LiveTrade] LTP fetch failed, using signal premium: ${e.message}`); }

      // Calculate max quantity that fits within max_per_trade limit
      const maxQtyByBudget = Math.floor(maxTrade / actualPremium);
      // Round down to nearest lot size
      const lotQty = Math.floor(maxQtyByBudget / lotSize) * lotSize;
      // Must have at least one lot, but ONLY if it fits within budget
      const oneLotCost = lotSize * actualPremium;
      if (oneLotCost > maxTrade) {
        console.log(`[LiveTrade] BLOCKED - 1 lot cost (${oneLotCost}) exceeds max_per_trade (${maxTrade})`);
        return { success: false, error: `1 lot cost ₹${Math.round(oneLotCost)} exceeds max per trade limit ₹${maxTrade}. Increase limit or choose a cheaper option.` };
      }
      const qty = Math.max(lotSize, lotQty);
      const estimatedInvestment = qty * actualPremium;
      // HARD CAP: Final investment must NOT exceed max_per_trade
      if (estimatedInvestment > maxTrade * 1.05) { // 5% tolerance for price slippage
        console.log(`[LiveTrade] BLOCKED - Investment ₹${Math.round(estimatedInvestment)} exceeds max_per_trade ₹${maxTrade}`);
        return { success: false, error: `Trade investment ₹${Math.round(estimatedInvestment)} exceeds max per trade limit ₹${maxTrade}. Reduce lot size or increase limit.` };
      }
      console.log(`[LiveTrade] Premium: ₹${actualPremium}, Lot: ${lotSize}, Qty: ${qty}, Est. Investment: ₹${Math.round(estimatedInvestment)}, Max: ₹${maxTrade}`);
      const orderBody = { quantity: qty, product: 'I', validity: 'DAY', price: 0, instrument_token: instrumentToken, order_type: 'MARKET', transaction_type: 'BUY', disclosed_quantity: 0, trigger_price: 0, is_amo: false };
      const orderResp = await axios.post('https://api.upstox.com/v2/order/place', orderBody, { headers, timeout: 15000 });
      const orderId = orderResp.data?.data?.order_id || '';
      const orderSuccess = orderResp.data?.status === 'success';

      let actualEntryPrice = signal.entry_price;
      if (orderSuccess && orderId) {
        try {
          await new Promise(r => setTimeout(r, 2000));
          const orderDetail = await axios.get(`https://api.upstox.com/v2/order/details?order_id=${orderId}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' }, timeout: 10000 });
          const fillPrice = orderDetail.data?.data?.average_price || orderDetail.data?.data?.price || 0;
          if (fillPrice > 0) actualEntryPrice = fillPrice;
        } catch (e) { console.log(`[LiveTrade] Could not fetch fill price: ${e.message}`); }
      }

      if (!db.data.trades) db.data.trades = [];
      // FIX: Calculate SL/Target from actual fill price (not signal's hardcoded premium)
      const riskCfgLive = db.data?.settings?.risk || {};
      const autoTradingLive = db.data?.settings?.auto_trading || {};
      const riskParamsLive = { low: { stop_loss_pct: 15, target_pct: 30 }, medium: { stop_loss_pct: 25, target_pct: 50 }, high: { stop_loss_pct: 35, target_pct: 70 } };
      const rpLive = riskParamsLive[riskCfgLive.risk_tolerance || 'medium'] || riskParamsLive.medium;
      const slPctLive = autoTradingLive.stoploss_pct || riskCfgLive.stop_loss_pct || rpLive.stop_loss_pct;
      const tgtPctLive = Math.max(autoTradingLive.target_pct || riskCfgLive.target_pct || rpLive.target_pct, slPctLive);
      const liveStopLoss = Math.round(actualEntryPrice * (1 - slPctLive / 100) * 100) / 100;
      const liveTarget = Math.round(actualEntryPrice * (1 + tgtPctLive / 100) * 100) / 100;
      // Use signal's pre-calculated stop_loss and target (already set in generateSignal)
      const trade = {
        id: uuid(), signal_id: signal.id, trade_type: signal.signal_type,
        symbol: signal.option_symbol || signal.symbol,
        instrument: signal.symbol || 'NIFTY50',
        entry_time: new Date().toISOString(),
        entry_price: actualEntryPrice, quantity: qty, investment: qty * actualEntryPrice,
        stop_loss: liveStopLoss,
        target: liveTarget,
        status: orderSuccess ? 'OPEN' : 'FAILED', mode: 'LIVE', order_id: orderId, instrument_token: instrumentToken,
        sentiment: signal.sentiment || 'N/A',
        confidence: signal.confidence || 0,
        sector: signal.sector || 'BROAD_MARKET',
        exit_time: null, exit_price: null, pnl: 0, pnl_percentage: 0,
        upstox_status: orderResp.data?.status || 'unknown', upstox_message: orderResp.data?.message || '',
      };
      db.data.trades.push(trade);
      if (orderSuccess) {
        const p = db.data.portfolio;
        if (p) { p.invested_amount = (p.invested_amount || 0) + signal.investment_amount; p.available_capital = (p.available_capital || 0) - signal.investment_amount; if (!p.active_positions) p.active_positions = []; p.active_positions.push(trade.id); p.last_updated = new Date().toISOString(); }
        // Telegram: Trade Entry Alert (LIVE)
        const tgAlerts = db.data?.settings?.telegram?.alerts || {};
        if (tgAlerts.trade_entry !== false) {
          telegram.sendTradeEntryAlert(trade).catch(() => {});
        }
      }
      db.save();
      return { success: orderSuccess, order_id: orderId, trade };
    } catch (err) {
      const upstoxErr = err.response?.data?.message || err.response?.data?.errors?.[0]?.message || err.message;
      if (!db.data.trades) db.data.trades = [];
      db.data.trades.push({ id: uuid(), signal_id: signal.id, trade_type: signal.signal_type, symbol: signal.symbol, entry_time: new Date().toISOString(), entry_price: signal.entry_price, quantity: signal.quantity, investment: signal.investment_amount, status: 'FAILED', mode: 'LIVE', error: `${err.response?.status || 'unknown'}: ${upstoxErr}`, exit_time: null, exit_price: null, pnl: 0, pnl_percentage: 0 });
      db.save();
      return { success: false, error: `${err.response?.status || 'unknown'}: ${upstoxErr}` };
    }
  }

  function _getHistoricalAdjustment(sector, sentiment) {
    const patterns = db.data.historical_patterns || [];
    const matching = patterns.filter(p => p.sector === sector && p.sentiment === sentiment);
    if (matching.length < 3) return 0;
    const winRate = matching.filter(p => p.was_profitable).length / matching.length;
    if (winRate >= 0.7) return 10;  // Strong positive history
    if (winRate >= 0.5) return 3;   // Slightly positive
    if (winRate <= 0.2) return -15;  // Very poor history, strongly discourage
    if (winRate <= 0.3) return -10;  // Poor history
    return 0;
  }

  // AI JOURNAL-BASED TRADE BLOCKING
  // If journal shows consistent losses (>= 5 trades, win rate <= 20%) for a sector+sentiment+type combo, block it
  function _shouldBlockFromJournal(sector, sentimentDir, tradeType) {
    const patterns = db.data.historical_patterns || [];
    const journalEntries = db.data.journal_entries || [];
    // Check historical patterns
    const matching = patterns.filter(p =>
      p.sector === sector &&
      p.sentiment === sentimentDir &&
      (tradeType ? p.trade_type === tradeType : true)
    );
    if (matching.length >= 5) {
      const winRate = matching.filter(p => p.was_profitable).length / matching.length;
      if (winRate <= 0.20) {
        console.log(`[Journal] BLOCK: ${sector}/${sentimentDir}/${tradeType} - ${matching.length} trades, ${Math.round(winRate * 100)}% win rate`);
        return true;
      }
    }
    // Check AI journal reviews for repeat failures
    const recentReviews = journalEntries.filter(j =>
      j.sector === sector && j.trade_type === tradeType && j.created_at > new Date(Date.now() - 7 * 86400000).toISOString()
    );
    const failedReviews = recentReviews.filter(j => j.pnl < 0);
    if (failedReviews.length >= 3 && failedReviews.length > recentReviews.length * 0.7) {
      console.log(`[Journal] BLOCK: ${sector}/${tradeType} - ${failedReviews.length}/${recentReviews.length} recent reviews are losses`);
      return true;
    }
    return false;
  }

  // ===== FEATURE 1: MULTI-TIMEFRAME CONFIRMATION =====
  // Async check: verify signal direction matches 2+ timeframes
  async function validateMultiTimeframe(signal) {
    const multiTF = db.data?.settings?.ai_guards?.multi_timeframe !== false; // default ON
    if (!multiTF) return { valid: true, reason: 'Multi-TF check disabled' };

    const settings = db.data?.settings || {};
    const activeBroker = settings.active_broker || settings.broker?.name || 'upstox';
    const token = settings.broker?.[`${activeBroker}_token`] || settings.broker?.access_token;
    if (!token) return { valid: true, reason: 'No broker token - skipping TF check' };

    const inst = signal.symbol || 'NIFTY50';
    const instKey = INST_KEY_MAP[inst] || INST_KEY_MAP.NIFTY50;
    const headers = { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' };
    const signalDir = signal.signal_type; // 'CALL' = bullish, 'PUT' = bearish

    const timeframes = [
      { name: '5min', type: 'intraday', upstox: '1minute', aggregate: 5 },
      { name: '30min', type: 'intraday', upstox: '30minute', aggregate: 0 },
    ];

    let bullishCount = 0, bearishCount = 0;
    for (const tf of timeframes) {
      try {
        let url;
        let resp;
        if (tf.type === 'intraday') {
          url = `https://api.upstox.com/v2/historical-candle/intraday/${encodeURIComponent(instKey)}/${tf.upstox}`;
          resp = await axios.get(url, { headers, timeout: 8000 });
        }
        // If intraday returned 0 candles (market closed), fallback to daily
        const intradayRaw = resp?.data?.data?.candles || [];
        if (tf.type !== 'intraday' || intradayRaw.length === 0) {
          const now = new Date();
          const toDate = now.toISOString().substring(0, 10);
          const fromDate = new Date(now.getTime() - 90 * 86400000).toISOString().substring(0, 10);
          url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instKey)}/day/${toDate}/${fromDate}`;
          resp = await axios.get(url, { headers, timeout: 8000 });
        }
        const raw = resp?.data?.data?.candles || [];
        if (raw.length < 10) continue;

        // Simple trend detection: compare recent close vs EMA
        // Latest candle is first in Upstox response
        const closes = raw.slice(0, 20).map(c => c[4]).reverse(); // chronological
        if (closes.length < 5) continue;

        const ema5 = _calcEMA(closes, 5);
        const ema10 = closes.length >= 10 ? _calcEMA(closes, 10) : ema5;
        const latestClose = closes[closes.length - 1];

        if (latestClose > ema5 && ema5 > ema10) bullishCount++;
        else if (latestClose < ema5 && ema5 < ema10) bearishCount++;
        // neutral = no count for either
      } catch (e) {
        console.log(`[MultiTF] ${tf.name} fetch failed: ${e.message}`);
      }
    }

    const directionMatch = signalDir === 'CALL' ? bullishCount : bearishCount;
    const oppositeCount = signalDir === 'CALL' ? bearishCount : bullishCount;

    if (directionMatch >= 2) {
      console.log(`[MultiTF] CONFIRMED - ${signalDir} matches ${directionMatch} timeframes`);
      return { valid: true, reason: `${directionMatch} timeframes confirm ${signalDir}`, bullish: bullishCount, bearish: bearishCount };
    }
    if (oppositeCount >= 2) {
      console.log(`[MultiTF] REJECTED - ${oppositeCount} timeframes OPPOSE ${signalDir}`);
      return { valid: false, reason: `${oppositeCount} timeframes oppose ${signalDir}. Signal direction mismatch.`, bullish: bullishCount, bearish: bearishCount };
    }
    // 1 match or mixed → allow with warning
    console.log(`[MultiTF] MIXED - B:${bullishCount} vs Bear:${bearishCount}. Allowing ${signalDir} with caution.`);
    return { valid: true, reason: `Mixed timeframes (B:${bullishCount}, Bear:${bearishCount})`, bullish: bullishCount, bearish: bearishCount };
  }

  function _calcEMA(data, period) {
    if (data.length < period) return data[data.length - 1];
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  return { generateSignal, executePaperTrade, executeLiveTrade, validateMultiTimeframe, INSTRUMENTS, INST_KEY_MAP, LOT_SIZE_MAP };
};
