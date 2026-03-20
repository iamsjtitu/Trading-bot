/**
 * Signal Generator Module
 * Generates trading signals from news sentiment and executes paper/live trades.
 */
const axios = require('axios');
const crypto = require('crypto');
function uuid() { return crypto.randomUUID(); }

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

    const maxTrade = riskCfg.max_per_trade || 20000;
    const dailyLimit = riskCfg.daily_limit || 100000;

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
    const positionSize = Math.min(dynamicSize.size, basePositionSize);
    if (positionSize < 1000) return null;

    const optionPremium = 150;
    const quantity = Math.floor(positionSize / optionPremium);
    if (quantity === 0) return null;

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
      position_sizing: dynamicSize.factors, reason: enhancedReason, news_id: newsDoc.id, status: 'ACTIVE',
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

      // STRICT max_per_trade enforcement
      const riskCfg = db.data?.settings?.risk || {};
      const maxTrade = riskCfg.max_per_trade || 20000;

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
      // Use signal's pre-calculated stop_loss and target (already set in generateSignal)
      const trade = {
        id: uuid(), signal_id: signal.id, trade_type: signal.signal_type,
        symbol: signal.option_symbol || signal.symbol,
        instrument: signal.symbol || 'NIFTY50',
        entry_time: new Date().toISOString(),
        entry_price: actualEntryPrice, quantity: qty, investment: qty * actualEntryPrice,
        stop_loss: signal.stop_loss || Math.round(actualEntryPrice * 0.80 * 100) / 100,
        target: signal.target || Math.round(actualEntryPrice * 1.20 * 100) / 100,
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

  return { generateSignal, executePaperTrade, executeLiveTrade, INSTRUMENTS, INST_KEY_MAP, LOT_SIZE_MAP };
};
