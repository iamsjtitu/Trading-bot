/**
 * Trading Routes (Refactored)
 * Slim route definitions using modular lib/ imports.
 */
const { Router } = require('express');
const crypto = require('crypto');
const axios = require('axios');
const createSignalGenerator = require('./lib/signal_generator');
const { calculateTaxReport } = require('./lib/tax_calculator');
let OpenAI; try { OpenAI = require('openai'); } catch (_) { OpenAI = null; }

function uuid() { return crypto.randomUUID(); }

module.exports = function (db) {
  const router = Router();
  const AIDecisionEngine = require('./ai_engine');
  const aiEngine = new AIDecisionEngine(db);
  const signalGen = createSignalGenerator(db, aiEngine);

  const INSTRUMENTS = { NIFTY50: { exchange: 'NSE' }, BANKNIFTY: { exchange: 'NSE' }, FINNIFTY: { exchange: 'NSE' }, MIDCPNIFTY: { exchange: 'NSE' }, SENSEX: { exchange: 'BSE' }, BANKEX: { exchange: 'BSE' } };

  // ============ Shared State ============
  function getActiveBrokerToken() { const s = db.data.settings || {}; const b = s.active_broker || s.broker?.name || 'upstox'; return s.broker?.[`${b}_token`] || s.broker?.access_token || null; }
  let autoExitEnabled = db.data?.settings?.auto_trading?.auto_exit ?? true;
  let autoEntryEnabled = db.data?.settings?.auto_trading?.auto_entry ?? false;
  let customTargetPct = db.data?.settings?.auto_trading?.target_pct ?? null;
  let customStoplossPct = db.data?.settings?.auto_trading?.stoploss_pct ?? null;
  const riskParams = { low: { stop_loss_pct: 15, target_pct: 30, max_position_size: 0.03 }, medium: { stop_loss_pct: 25, target_pct: 50, max_position_size: 0.05 }, high: { stop_loss_pct: 35, target_pct: 70, max_position_size: 0.07 } };
  function getRiskTolerance() { return db.data?.settings?.risk?.risk_tolerance || 'medium'; }

  // ============ Signal Routes ============
  router.get('/api/signals/latest', (req, res) => { const limit = parseInt(req.query.limit) || 20; const currentMode = db.data.settings?.trading_mode || 'PAPER'; const sigs = (db.data.signals || []).filter(s => (s.mode || 'PAPER') === currentMode).slice(-limit).reverse(); res.json({ status: 'success', count: sigs.length, signals: sigs }); });
  router.get('/api/signals/active', (req, res) => { const currentMode = db.data.settings?.trading_mode || 'PAPER'; const active = (db.data.signals || []).filter(s => s.status === 'ACTIVE' && (s.mode || 'PAPER') === currentMode); res.json({ status: 'success', count: active.length, signals: active }); });

  // ============ Trade Query Routes ============
  router.get('/api/trades/active', async (req, res) => {
    const mode = db.data.settings?.trading_mode || 'PAPER';
    const accessToken = getActiveBrokerToken();
    const dbOpenTrades = (db.data.trades || []).filter(t => t.status === 'OPEN' && t.mode === mode);
    const rp = riskParams[getRiskTolerance()] || riskParams.medium;

    if (mode === 'LIVE' && accessToken) {
      let positions = [];
      try {
        const headers = { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' };
        const posResp = await axios.get('https://api.upstox.com/v2/portfolio/short-term-positions', { headers, timeout: 10000 });
        if (posResp.data?.status === 'success') positions = (posResp.data.data || []).filter(p => p.quantity !== 0);
      } catch (err) { console.error('[Trades] Live positions fetch error:', err.message); }

      const posMap = {}; for (const p of positions) { if (p.instrument_token) posMap[p.instrument_token] = p; }
      for (const t of dbOpenTrades) {
        if (t.instrument_token && !posMap[t.instrument_token]) {
          // Position closed on broker - estimate exit data from last known price
          const lastPrice = t.current_price || t.entry_price || 0;
          const qty = t.quantity || 1;
          t.status = 'CLOSED';
          t.exit_time = new Date().toISOString();
          t.exit_reason = 'POSITION_CLOSED_ON_BROKER';
          t.exit_price = lastPrice;
          t.pnl = Math.round((lastPrice - (t.entry_price || 0)) * qty * 100) / 100;
          t.pnl_percentage = t.entry_price > 0 ? Math.round(((lastPrice - t.entry_price) / t.entry_price) * 10000) / 100 : 0;
          const sig = (db.data.signals || []).find(s => s.id === t.signal_id);
          if (sig) sig.status = 'CLOSED';
          if (db._autoReviewTrade) db._autoReviewTrade(t.id).catch(e => console.error('[Journal] Auto-review error:', e.message));
        }
      }
      db.save();

      const storedTradesMap = {}; for (const t of (db.data.trades || [])) { if (t.mode === 'LIVE' && t.status === 'OPEN' && t.instrument_token) storedTradesMap[t.instrument_token] = t; }
      const tradesFromPositions = positions.map(pos => {
        const entryPrice = pos.average_price || pos.buy_price || (pos.buy_quantity > 0 ? pos.buy_value / pos.buy_quantity : 0);
        const qty = Math.abs(pos.quantity); const investment = entryPrice * qty; const currentPrice = pos.last_price || 0; const currentValue = currentPrice * qty;
        // ALWAYS calculate P&L ourselves for consistency: (currentPrice - entryPrice) * qty
        const livePnl = (currentPrice - entryPrice) * qty;
        const pnlPercentage = entryPrice > 0 ? Math.round(((currentPrice - entryPrice) / entryPrice) * 10000) / 100 : 0;
        const stored = storedTradesMap[pos.instrument_token] || {};
        if (stored.id && entryPrice > 0 && (stored.entry_price === 0 || stored.entry_price === 150)) { stored.entry_price = entryPrice; stored.investment = investment; const riskCfg = db.data?.settings?.risk || {}; const autoT = db.data?.settings?.auto_trading || {}; const slPct = autoT.stoploss_pct || riskCfg.stop_loss_pct || rp.stop_loss_pct; const tgtPct = autoT.target_pct || riskCfg.target_pct || rp.target_pct; stored.stop_loss = Math.round(entryPrice * (1 - slPct / 100) * 100) / 100; stored.target = Math.round(entryPrice * (1 + tgtPct / 100) * 100) / 100; db.save(); }
        return { id: stored.id || pos.instrument_token, trade_type: pos.quantity > 0 ? 'BUY' : 'SELL', symbol: pos.trading_symbol || stored.symbol || 'N/A', quantity: qty, status: 'OPEN', entry_price: Math.round(entryPrice * 100) / 100, current_price: Math.round(currentPrice * 100) / 100, current_value: Math.round(currentValue * 100) / 100, investment: Math.round(investment * 100) / 100, live_pnl: Math.round(livePnl * 100) / 100, pnl_percentage: pnlPercentage, stop_loss: stored.stop_loss || 0, target: stored.target || 0, entry_time: stored.entry_time || new Date().toISOString(), isLive: true, instrument_token: pos.instrument_token || '', product: pos.product || '', signal_id: stored.signal_id || '' };
      });
      return res.json({ status: 'success', count: tradesFromPositions.length, trades: tradesFromPositions, isLive: true });
    }

    const tradesWithPnl = dbOpenTrades.map(trade => {
      // Simulate realistic price movement - small incremental walk from last known price
      if (!trade._simPrice) trade._simPrice = trade.entry_price;
      const volatility = trade.entry_price * 0.0003; // 0.03% per tick
      const drift = (Math.random() - 0.48) * volatility; // slight upward bias
      trade._simPrice = Math.max(trade._simPrice + drift, trade.entry_price * 0.7);
      const cp = trade._simPrice;
      const cv = cp * trade.quantity; const pnl = cv - trade.investment;
      return { ...trade, current_price: Math.round(cp * 100) / 100, current_value: Math.round(cv * 100) / 100, live_pnl: Math.round(pnl * 100) / 100, pnl_percentage: Math.round((pnl / trade.investment) * 10000) / 100, _simPrice: undefined };
    });
    res.json({ status: 'success', count: tradesWithPnl.length, trades: tradesWithPnl });
  });

  router.get('/api/trades/today', async (req, res) => { const todayStart = new Date(); todayStart.setHours(0,0,0,0); const todayISO = todayStart.toISOString(); const currentMode = db.data.settings?.trading_mode || 'PAPER'; const allTrades = (db.data.trades || []).filter(t => (t.entry_time || '') >= todayISO && (t.mode || 'PAPER') === currentMode); const closed = allTrades.filter(t => t.status === 'CLOSED'); const openTrades = allTrades.filter(t => t.status === 'OPEN');
    // Realized P&L from closed trades
    const realizedPnl = Math.round(closed.reduce((s,t)=>s+(t.pnl||0),0)*100)/100;
    // Unrealized P&L from open trades (live positions)
    let unrealizedPnl = 0;
    if (currentMode === 'LIVE') {
      const token = getActiveBrokerToken();
      if (token) {
        try {
          const headers = { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' };
          const posResp = await axios.get('https://api.upstox.com/v2/portfolio/short-term-positions', { headers, timeout: 10000 });
          if (posResp.data?.status === 'success') {
            const positions = (posResp.data.data || []).filter(p => p.quantity !== 0);
            for (const pos of positions) {
              const entry = pos.average_price || 0;
              const current = pos.last_price || 0;
              const qty = Math.abs(pos.quantity);
              unrealizedPnl += (current - entry) * qty;
            }
          }
        } catch (e) { console.error('[Today] Live position fetch error:', e.message); }
      }
    }
    unrealizedPnl = Math.round(unrealizedPnl * 100) / 100;
    const totalTodayPnl = Math.round((realizedPnl + unrealizedPnl) * 100) / 100;
    res.json({ status: 'success', total_trades_today: allTrades.length, closed_trades: closed.length, open_trades: openTrades.length, today_pnl: totalTodayPnl, realized_pnl: realizedPnl, unrealized_pnl: unrealizedPnl, today_invested: Math.round(allTrades.reduce((s,t)=>s+(t.investment||0),0)*100)/100 }); });

  router.get('/api/trades/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 200; const { trade_type, status, date_from, date_to, sort_by, sort_order, mode } = req.query;
    let trades = (db.data.trades || []).slice(); const currentMode = db.data.settings?.trading_mode || 'PAPER'; const filterMode = mode || currentMode;
    if (filterMode !== 'all') trades = trades.filter(t => (t.mode || 'PAPER') === filterMode);
    trades = trades.filter(t => t.status !== 'FAILED');
    if (trade_type && trade_type !== 'all') trades = trades.filter(t => t.trade_type === trade_type);
    if (status && status !== 'all') trades = trades.filter(t => t.status === status);
    if (date_from) trades = trades.filter(t => (t.entry_time || '') >= date_from);
    if (date_to) trades = trades.filter(t => (t.entry_time || '') <= date_to + 'T23:59:59');
    const field = ['entry_time','pnl','investment','pnl_percentage'].includes(sort_by) ? sort_by : 'entry_time'; const dir = sort_order === 'asc' ? 1 : -1;
    trades.sort((a,b) => { const va = a[field]||0; const vb = b[field]||0; return typeof va === 'string' ? dir*va.localeCompare(vb) : dir*(va-vb); });
    trades = trades.slice(0, limit);
    const closed = trades.filter(t=>t.status==='CLOSED'); const wins = closed.filter(t=>(t.pnl||0)>0); const losses = closed.filter(t=>(t.pnl||0)<=0);
    const summary = { total_trades: trades.length, closed_trades: closed.length, open_trades: trades.filter(t=>t.status==='OPEN').length, winning_trades: wins.length, losing_trades: losses.length, win_rate: closed.length ? Math.round((wins.length/closed.length)*1000)/10 : 0, total_pnl: Math.round(closed.reduce((s,t)=>s+(t.pnl||0),0)*100)/100, avg_win: wins.length ? Math.round(wins.reduce((s,t)=>s+t.pnl,0)/wins.length*100)/100 : 0, avg_loss: losses.length ? Math.round(losses.reduce((s,t)=>s+t.pnl,0)/losses.length*100)/100 : 0, total_investment: Math.round(trades.reduce((s,t)=>s+(t.investment||0),0)*100)/100, best_trade: closed.length ? Math.round(Math.max(...closed.map(t=>t.pnl||0))*100)/100 : 0, worst_trade: closed.length ? Math.round(Math.min(...closed.map(t=>t.pnl||0))*100)/100 : 0 };
    res.json({ status: 'success', count: trades.length, trades, summary });
  });

  router.get('/api/daily-summary', (req, res) => { const todayStart = new Date(); todayStart.setHours(0,0,0,0); const todayISO = todayStart.toISOString(); const allTrades = (db.data.trades||[]).filter(t=>(t.entry_time||'')>=todayISO); const closed = allTrades.filter(t=>t.status==='CLOSED'); const wins = closed.filter(t=>(t.pnl||0)>0); const totalPnl = closed.reduce((s,t)=>s+(t.pnl||0),0); res.json({ status:'success', summary: { date: todayStart.toISOString().split('T')[0], total_trades: allTrades.length, closed_trades: closed.length, open_trades: allTrades.filter(t=>t.status==='OPEN').length, winning_trades: wins.length, losing_trades: closed.length-wins.length, win_rate: closed.length?Math.round((wins.length/closed.length)*1000)/10:0, total_pnl: Math.round(totalPnl*100)/100, total_invested: Math.round(allTrades.reduce((s,t)=>s+(t.investment||0),0)*100)/100, signals_generated: (db.data.signals||[]).filter(s=>(s.created_at||'')>=todayISO).length, news_analyzed: (db.data.news_articles||[]).filter(n=>(n.created_at||'')>=todayISO).length, best_trade: closed.length?Math.round(Math.max(...closed.map(t=>t.pnl||0))*100)/100:0, worst_trade: closed.length?Math.round(Math.min(...closed.map(t=>t.pnl||0))*100)/100:0 }}); });

  // ============ Telegram ============
  router.post('/api/telegram/send-daily-summary', async (req, res) => { try { const settings = db.data.settings||{}; const telegram = settings.telegram||{}; if (!telegram.enabled||!telegram.bot_token||!telegram.chat_id) return res.json({status:'error',message:'Telegram not configured'}); const todayStart=new Date();todayStart.setHours(0,0,0,0); const todayISO=todayStart.toISOString(); const allTrades=(db.data.trades||[]).filter(t=>(t.entry_time||'')>=todayISO); const closed=allTrades.filter(t=>t.status==='CLOSED'); const wins=closed.filter(t=>(t.pnl||0)>0); const totalPnl=closed.reduce((s,t)=>s+(t.pnl||0),0); const portfolio=db.data.portfolio||{}; const mode=settings.trading_mode||'PAPER'; const pnlSign=totalPnl>=0?'+':''; const message=`*AI Trading Bot - Daily Summary*\n*Date:* ${todayStart.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}\n*Mode:* ${mode}\n\n*Today's Performance:*\nTotal Trades: ${allTrades.length}\nClosed: ${closed.length} | Open: ${allTrades.filter(t=>t.status==='OPEN').length}\nWinning: ${wins.length} | Losing: ${closed.length-wins.length}\nWin Rate: ${closed.length?Math.round((wins.length/closed.length)*1000)/10:0}%\n\n*P&L: ${pnlSign}${Math.round(totalPnl).toLocaleString()}*\n\n*Portfolio:*\nValue: ${Math.round(portfolio.current_value||500000).toLocaleString()}\nTotal P&L: ${Math.round(portfolio.total_pnl||0).toLocaleString()}\n\n_Sent automatically by AI Trading Bot_`; const resp=await axios.post(`https://api.telegram.org/bot${telegram.bot_token}/sendMessage`,{chat_id:telegram.chat_id,text:message,parse_mode:'Markdown'},{timeout:15000}); res.json(resp.data?.ok?{status:'success',message:'Daily summary sent to Telegram!'}:{status:'error',message:`Telegram error: ${resp.data?.description||'Unknown'}`}); } catch(err) { res.json({status:'error',message:err.message}); } });

  // ============ Auto-Exit ============
  router.post('/api/auto-exit/check', async (req, res) => {
    if (!autoExitEnabled) return res.json({ status: 'success', exits_executed: 0, new_trades_generated: 0 });
    const trades = db.data.trades || []; const openTrades = trades.filter(t => t.status === 'OPEN');
    let exitsCount = 0, newTradesCount = 0; const exitDetails = [];
    const rp = riskParams[getRiskTolerance()] || riskParams.medium;
    const targetPct = customTargetPct != null ? customTargetPct : rp.target_pct;
    const stoplossPct = customStoplossPct != null ? customStoplossPct : rp.stop_loss_pct;
    const mode = db.data.settings?.trading_mode || 'PAPER';
    const accessToken = getActiveBrokerToken();

    // Sync entry prices from Upstox (LIVE)
    if (mode === 'LIVE' && accessToken) {
      try { const headers = { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' }; const posResp = await axios.get('https://api.upstox.com/v2/portfolio/short-term-positions', { headers, timeout: 10000 }); if (posResp.data?.status === 'success') { const posMap = {}; for (const p of (posResp.data.data || [])) { if (p.instrument_token) posMap[p.instrument_token] = p; } for (const trade of openTrades) { if (trade.mode === 'LIVE' && trade.instrument_token && posMap[trade.instrument_token]) { const pos = posMap[trade.instrument_token]; const realEntry = pos.average_price || pos.buy_price || (pos.buy_quantity > 0 ? pos.buy_value / pos.buy_quantity : 0); if (realEntry > 0 && (trade.entry_price === 0 || trade.entry_price === 150 || Math.abs(trade.entry_price - realEntry) > realEntry * 0.5)) { trade.entry_price = realEntry; trade.investment = realEntry * trade.quantity; trade.stop_loss = Math.round(realEntry * (1 - stoplossPct / 100) * 100) / 100; trade.target = Math.round(realEntry * (1 + targetPct / 100) * 100) / 100; } } } db.save(); } } catch (err) { console.error('[AutoExit] Positions sync error:', err.message); }
    }

    for (const trade of openTrades) {
      let currentPrice;
      if (mode === 'LIVE' && accessToken && trade.instrument_token) {
        try { const ltp = await axios.get(`https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodeURIComponent(trade.instrument_token)}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' }, timeout: 10000 }); const quotes = ltp.data?.data || {}; const key = Object.keys(quotes)[0]; currentPrice = quotes[key]?.last_price || null; if (!currentPrice) continue; } catch (err) { continue; }
      } else { currentPrice = trade.entry_price * (1 + (Math.random() - 0.5) * 0.3); }

      const targetPrice = trade.entry_price * (1 + targetPct / 100); const stoplossPrice = trade.entry_price * (1 - stoplossPct / 100);
      let shouldExit = false, exitReason = '';
      if (currentPrice >= targetPrice) { shouldExit = true; exitReason = 'TARGET_HIT'; }
      else if (currentPrice <= stoplossPrice) { shouldExit = true; exitReason = 'STOPLOSS_HIT'; }

      if (shouldExit) {
        if (mode === 'LIVE' && accessToken && trade.instrument_token) {
          try { const sellResp = await axios.post('https://api.upstox.com/v2/order/place', { quantity: trade.quantity, product: 'I', validity: 'DAY', price: 0, instrument_token: trade.instrument_token, order_type: 'MARKET', transaction_type: 'SELL', disclosed_quantity: 0, trigger_price: 0, is_amo: false }, { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0', 'Content-Type': 'application/json' }, timeout: 15000 }); trade.exit_order_id = sellResp.data?.data?.order_id || ''; } catch (err) { trade.exit_error = err.message; }
        }
        const pnl = (currentPrice - trade.entry_price) * trade.quantity; const pnlPct = (pnl / trade.investment) * 100;
        trade.status = 'CLOSED'; trade.exit_time = new Date().toISOString(); trade.exit_price = Math.round(currentPrice * 100) / 100; trade.pnl = Math.round(pnl * 100) / 100; trade.pnl_percentage = Math.round(pnlPct * 100) / 100; trade.exit_reason = exitReason;
        const p = db.data.portfolio; if (p) { p.available_capital = (p.available_capital || 0) + currentPrice * trade.quantity; p.invested_amount = (p.invested_amount || 0) - trade.investment; p.total_pnl = (p.total_pnl || 0) + pnl; p.total_trades = (p.total_trades || 0) + 1; if (pnl > 0) p.winning_trades = (p.winning_trades || 0) + 1; else p.losing_trades = (p.losing_trades || 0) + 1; p.last_updated = new Date().toISOString(); }
        const sig = (db.data.signals || []).find(s => s.id === trade.signal_id); if (sig) sig.status = 'CLOSED';
        if (!db.data.historical_patterns) db.data.historical_patterns = [];
        db.data.historical_patterns.push({ id: uuid(), sentiment: trade.sentiment || sig?.sentiment, sector: sig?.sector || 'BROAD_MARKET', trade_type: trade.trade_type, pnl: trade.pnl, pnl_percentage: trade.pnl_percentage, exit_reason: exitReason, entry_time: trade.entry_time, exit_time: trade.exit_time, confidence: sig?.confidence, was_profitable: pnl > 0, created_at: new Date().toISOString() });

        exitsCount++;
        exitDetails.push({ trade_id: trade.id, symbol: trade.symbol, type: trade.trade_type, entry: trade.entry_price, exit: currentPrice, pnl: Math.round(pnl * 100) / 100, pnl_pct: Math.round(pnlPct * 100) / 100, reason: exitReason });
        if (db.notify) db.notify('exit', `${exitReason === 'TARGET_HIT' ? 'Target Hit' : 'Stoploss Hit'}`, `${trade.symbol} | P&L: ${pnl >= 0 ? '+' : ''}${Math.round(pnl)} (${Math.round(pnlPct)}%)`);
        if (db._autoReviewTrade) db._autoReviewTrade(trade.id).catch(e => console.error('[Journal] Auto-review error:', e.message));

        if (autoEntryEnabled && exitReason === 'TARGET_HIT') {
          const news = (db.data.news_articles || []).filter(n => n.sentiment_analysis && n.sentiment_analysis.confidence >= 60 && ['BUY_CALL', 'BUY_PUT'].includes(n.sentiment_analysis.trading_signal)).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
          const latestNews = news[0] || (db.data.news_articles || []).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
          if (latestNews) {
            const newSignal = signalGen.generateSignal(latestNews);
            if (newSignal) { db.data.signals.push(newSignal); if (mode === 'LIVE' && accessToken) { const r = await signalGen.executeLiveTrade(newSignal, accessToken); if (r?.success) newTradesCount++; } else { signalGen.executePaperTrade(newSignal); newTradesCount++; } }
          }
        }
      }
    }
    if (exitsCount > 0) db.save();
    res.json({ status: 'success', exits_executed: exitsCount, new_trades_generated: newTradesCount, details: exitDetails });
  });

  // ============ Auto Settings ============
  router.post('/api/auto-settings/update', (req, res) => { const body = req.body || {}; if ('auto_exit' in body) autoExitEnabled = body.auto_exit; if ('auto_entry' in body) autoEntryEnabled = body.auto_entry; if ('target_pct' in body) customTargetPct = body.target_pct; if ('stoploss_pct' in body) customStoplossPct = body.stoploss_pct; if (!db.data.settings) db.data.settings = {}; if (!db.data.settings.auto_trading) db.data.settings.auto_trading = {}; db.data.settings.auto_trading.auto_exit = autoExitEnabled; db.data.settings.auto_trading.auto_entry = autoEntryEnabled; if (customTargetPct != null) db.data.settings.auto_trading.target_pct = customTargetPct; if (customStoplossPct != null) db.data.settings.auto_trading.stoploss_pct = customStoplossPct; if (!db.data.settings.risk) db.data.settings.risk = {}; if (customTargetPct != null) db.data.settings.risk.target_pct = customTargetPct; if (customStoplossPct != null) db.data.settings.risk.stop_loss_pct = customStoplossPct; db.save(); const rp = riskParams[getRiskTolerance()] || riskParams.medium; res.json({ status: 'success', settings: { auto_exit: autoExitEnabled, auto_entry: autoEntryEnabled, target_pct: customTargetPct != null ? customTargetPct : rp.target_pct, stoploss_pct: customStoplossPct != null ? customStoplossPct : rp.stop_loss_pct } }); });
  router.get('/api/auto-settings', (req, res) => { const savedAT = db.data?.settings?.auto_trading || {}; if (savedAT.target_pct != null) customTargetPct = savedAT.target_pct; if (savedAT.stoploss_pct != null) customStoplossPct = savedAT.stoploss_pct; if (savedAT.auto_exit != null) autoExitEnabled = savedAT.auto_exit; if (savedAT.auto_entry != null) autoEntryEnabled = savedAT.auto_entry; const rp = riskParams[getRiskTolerance()] || riskParams.medium; res.json({ status: 'success', settings: { auto_exit: autoExitEnabled, auto_entry: autoEntryEnabled, target_pct: customTargetPct != null ? customTargetPct : rp.target_pct, stoploss_pct: customStoplossPct != null ? customStoplossPct : rp.stop_loss_pct } }); });

  // ============ Trade Cleanup ============
  router.post('/api/trades/cleanup', async (req, res) => { const accessToken = getActiveBrokerToken(); if (!accessToken) return res.json({ status: 'error', message: 'Broker not connected' }); try { const headers = { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' }; const [orderResp, tradeBookResp] = await Promise.all([axios.get('https://api.upstox.com/v2/order/retrieve-all', { headers, timeout: 15000 }), axios.get('https://api.upstox.com/v2/order/trades/get-trades-for-day', { headers, timeout: 15000 }).catch(() => ({ data: {} }))]); if (orderResp.data?.status !== 'success') return res.json({ status: 'error', message: 'Failed to fetch orders' }); const orderMap = {}; for (const o of (orderResp.data.data || [])) { if (o.order_id) orderMap[o.order_id] = o; } const sellPriceByInstrument = {}; for (const tb of (tradeBookResp.data?.data || [])) { if (tb.transaction_type === 'SELL' && tb.instrument_token) { if (!sellPriceByInstrument[tb.instrument_token]) sellPriceByInstrument[tb.instrument_token] = { total_value: 0, total_qty: 0 }; sellPriceByInstrument[tb.instrument_token].total_value += (tb.average_price || 0) * (tb.filled_quantity || tb.quantity || 0); sellPriceByInstrument[tb.instrument_token].total_qty += (tb.filled_quantity || tb.quantity || 0); } } let fixed = 0; const liveTrades = (db.data.trades || []).filter(t => t.mode === 'LIVE'); for (const trade of liveTrades) { let changed = false; if (trade.order_id && orderMap[trade.order_id]) { const order = orderMap[trade.order_id]; const fillPrice = order.average_price || order.price || 0; const fillQty = order.filled_quantity || order.quantity || trade.quantity; if (fillPrice > 0 && Math.abs(trade.entry_price - fillPrice) > 1) { trade.entry_price = fillPrice; trade.quantity = fillQty; trade.investment = fillPrice * fillQty; changed = true; } } if (trade.status === 'CLOSED' && (!trade.exit_price || trade.exit_price === 0) && trade.instrument_token) { const sellData = sellPriceByInstrument[trade.instrument_token]; if (sellData && sellData.total_qty > 0) { trade.exit_price = Math.round(sellData.total_value / sellData.total_qty * 100) / 100; changed = true; } } if (changed) { const rp2 = riskParams[getRiskTolerance()] || riskParams.medium; trade.stop_loss = Math.round(trade.entry_price * (1 - (customStoplossPct != null ? customStoplossPct : rp2.stop_loss_pct) / 100) * 100) / 100; trade.target = Math.round(trade.entry_price * (1 + (customTargetPct != null ? customTargetPct : rp2.target_pct) / 100) * 100) / 100; if (trade.status === 'CLOSED' && trade.exit_price > 0 && trade.entry_price > 0) { trade.pnl = Math.round((trade.exit_price - trade.entry_price) * trade.quantity * 100) / 100; trade.pnl_percentage = Math.round(((trade.exit_price - trade.entry_price) / trade.entry_price) * 10000) / 100; } fixed++; } } db.save(); res.json({ status: 'success', fixed, total_live_trades: liveTrades.length, message: `Fixed ${fixed} trades` }); } catch (err) { res.json({ status: 'error', message: err.message }); } });

  // ============ Manual Exit ============
  router.post('/api/trades/manual-exit', async (req, res) => {
    const { instrument_token, trade_id } = req.body || {}; const mode = db.data.settings?.trading_mode || 'PAPER'; const accessToken = getActiveBrokerToken();
    if (mode === 'LIVE' && accessToken && instrument_token) {
      try { const headers = { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0', 'Content-Type': 'application/json' }; const posResp = await axios.get('https://api.upstox.com/v2/portfolio/short-term-positions', { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Api-Version': '2.0' }, timeout: 10000 }); let position = null; if (posResp.data?.status === 'success') position = (posResp.data.data || []).find(p => p.instrument_token === instrument_token && p.quantity !== 0); if (!position) return res.json({ status: 'error', message: 'Position not found on Upstox.' }); const qty = Math.abs(position.quantity); const txnType = position.quantity > 0 ? 'SELL' : 'BUY'; const orderResp = await axios.post('https://api.upstox.com/v2/order/place', { quantity: qty, product: 'I', validity: 'DAY', price: 0, instrument_token, order_type: 'MARKET', transaction_type: txnType, disclosed_quantity: 0, trigger_price: 0, is_amo: false }, { headers, timeout: 15000 }); const orderId = orderResp.data?.data?.order_id || ''; const orderSuccess = orderResp.data?.status === 'success'; const storedTrade = (db.data.trades || []).find(t => t.instrument_token === instrument_token && t.status === 'OPEN' && t.mode === 'LIVE'); if (storedTrade) { const exitPrice = position.last_price || 0; const entryPrice = position.average_price || storedTrade.entry_price || 0; const pnl = position.pnl || ((exitPrice - entryPrice) * qty); storedTrade.status = 'CLOSED'; storedTrade.exit_time = new Date().toISOString(); storedTrade.exit_price = exitPrice; storedTrade.pnl = Math.round(pnl * 100) / 100; storedTrade.pnl_percentage = entryPrice > 0 ? Math.round(((exitPrice - entryPrice) / entryPrice) * 10000) / 100 : 0; storedTrade.exit_reason = 'MANUAL_EXIT'; storedTrade.exit_order_id = orderId; const p = db.data.portfolio; if (p) { p.available_capital = (p.available_capital || 0) + (exitPrice * qty); p.invested_amount = Math.max(0, (p.invested_amount || 0) - storedTrade.investment); p.total_pnl = (p.total_pnl || 0) + pnl; p.total_trades = (p.total_trades || 0) + 1; if (pnl > 0) p.winning_trades = (p.winning_trades || 0) + 1; else p.losing_trades = (p.losing_trades || 0) + 1; p.last_updated = new Date().toISOString(); } db.save(); if (db._autoReviewTrade) db._autoReviewTrade(storedTrade.id).catch(e => console.error('[Journal] Auto-review error:', e.message)); } if (db.notify) db.notify('exit', 'Manual Exit', `${instrument_token} | Qty: ${qty}`); return res.json({ status: orderSuccess ? 'success' : 'error', message: orderSuccess ? `Exit order placed. Order ID: ${orderId}` : 'Exit order failed', order_id: orderId }); } catch (err) { return res.json({ status: 'error', message: `Exit failed: ${err.response?.data?.message || err.message}` }); }
    }
    const trade = (db.data.trades || []).find(t => (trade_id ? t.id === trade_id : t.instrument_token === instrument_token) && t.status === 'OPEN');
    if (!trade) return res.json({ status: 'error', message: 'Trade not found' });
    const exitPrice = trade.current_price || trade.entry_price * (1 + (Math.random() - 0.5) * 0.1); const pnl = (exitPrice - trade.entry_price) * trade.quantity;
    trade.status = 'CLOSED'; trade.exit_time = new Date().toISOString(); trade.exit_price = Math.round(exitPrice * 100) / 100; trade.pnl = Math.round(pnl * 100) / 100; trade.pnl_percentage = trade.entry_price > 0 ? Math.round(((exitPrice - trade.entry_price) / trade.entry_price) * 10000) / 100 : 0; trade.exit_reason = 'MANUAL_EXIT';
    const p = db.data.portfolio; if (p) { p.available_capital = (p.available_capital || 0) + (exitPrice * trade.quantity); p.invested_amount = Math.max(0, (p.invested_amount || 0) - trade.investment); p.total_pnl = (p.total_pnl || 0) + pnl; p.total_trades = (p.total_trades || 0) + 1; if (pnl > 0) p.winning_trades = (p.winning_trades || 0) + 1; else p.losing_trades = (p.losing_trades || 0) + 1; p.last_updated = new Date().toISOString(); }
    db.save(); if (db.notify) db.notify('exit', 'Manual Exit', `${trade.symbol} | P&L: ${Math.round(pnl)}`);
    if (db._autoReviewTrade) db._autoReviewTrade(trade.id).catch(e => console.error('[Journal] Auto-review error:', e.message));
    return res.json({ status: 'success', message: `Trade closed. P&L: ${Math.round(pnl * 100) / 100}` });
  });

  // ============ Execute Signal ============
  router.post('/api/trades/execute-signal', async (req, res) => { const { signal_id } = req.body || {}; const mode = db.data.settings?.trading_mode || 'PAPER'; let signal; if (signal_id) signal = (db.data.signals || []).find(s => s.id === signal_id); else { const tradedIds = new Set((db.data.trades || []).filter(t => t.status === 'OPEN').map(t => t.signal_id)); signal = (db.data.signals || []).filter(s => s.status === 'ACTIVE' && !tradedIds.has(s.id)).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]; } if (!signal) return res.json({ status: 'error', message: 'No active untraded signal found' }); if (mode === 'LIVE') { const token = getActiveBrokerToken(); if (!token) return res.json({ status: 'error', message: 'Broker not connected' }); const result = await signalGen.executeLiveTrade(signal, token); return res.json(result?.success ? { status: 'success', trade: result.trade, message: 'LIVE trade placed', order_id: result.order_id } : { status: 'error', message: result?.error || 'Trade execution failed', detail: result?.error }); } else { signalGen.executePaperTrade(signal); return res.json({ status: 'success', message: 'Paper trade executed' }); } });

  // ============ Debug / Test ============
  router.get('/api/trades/log', (req, res) => { const limit = parseInt(req.query.limit) || 50; const mode = db.data.settings?.trading_mode || 'PAPER'; const allTrades = (db.data.trades || []).filter(t => (t.mode || 'PAPER') === mode).slice(-limit).reverse(); res.json({ status: 'success', total: allTrades.length, open: allTrades.filter(t => t.status === 'OPEN').length, closed: allTrades.filter(t => t.status === 'CLOSED').length, failed: allTrades.filter(t => t.status === 'FAILED').length, trades: allTrades }); });

  router.get('/api/debug/auto-trade-test', async (req, res) => {
    const steps = []; const settings = db.data?.settings || {};
    steps.push({ step: 1, name: 'Trading Mode', value: settings.trading_mode || 'PAPER', ok: (settings.trading_mode || 'PAPER') === 'LIVE' });
    steps.push({ step: 2, name: 'Auto-Entry Enabled', value: settings.auto_trading?.auto_entry || false, ok: settings.auto_trading?.auto_entry === true });
    const activeBroker = settings.active_broker || settings.broker?.name || 'upstox'; const token = settings.broker?.[`${activeBroker}_token`] || settings.broker?.access_token || null;
    steps.push({ step: 3, name: 'Broker Token', value: token ? `Found (${activeBroker}: ${token.substring(0, 12)}...)` : 'MISSING', ok: !!token });
    steps.push({ step: 4, name: 'Active Instrument', value: settings.trading_instrument || 'NIFTY50', ok: true });
    const activeSignals = (db.data.signals || []).filter(s => s.status === 'ACTIVE'); const tradedSignalIds = new Set((db.data.trades || []).filter(t => t.status === 'OPEN').map(t => t.signal_id)); const untradedSignals = activeSignals.filter(s => !tradedSignalIds.has(s.id));
    steps.push({ step: 5, name: 'Active Signals', value: `${activeSignals.length} total, ${untradedSignals.length} untraded`, ok: untradedSignals.length > 0 });
    const recentTrades = (db.data.trades || []).filter(t => t.mode === 'LIVE').slice(-5).reverse();
    steps.push({ step: 6, name: 'Recent LIVE Trades', ok: recentTrades.length > 0, value: `${recentTrades.length} total`, trades: recentTrades.map(t => ({ id: t.id?.substring(0, 8), status: t.status, type: t.trade_type, symbol: t.symbol, error: t.error || '', time: t.entry_time })) });
    res.json({ status: 'success', all_ok: steps.every(s => s.ok), version: '4.0.1', steps });
  });

  router.post('/api/test/generate-trade', (req, res) => { const latestNews = (db.data.news_articles || []).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]; if (!latestNews) return res.json({ status: 'failed', message: 'No news available' }); const signal = signalGen.generateSignal(latestNews); if (signal) { db.data.signals.push(signal); signalGen.executePaperTrade(signal); db.save(); return res.json({ status: 'success', message: 'New trade generated', signal }); } res.json({ status: 'failed', message: 'Could not generate signal' }); });

  // ============ Market Helpers ============
  function isMarketOpen() { const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000); const day = ist.getUTCDay(); if (day === 0 || day === 6) return false; const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes(); return mins >= 555 && mins <= 930; }

  // ============ Square-off Warning ============
  router.post('/api/market/square-off-check', async (req, res) => { try { const openTrades = (db.data.trades || []).filter(t => t.status === 'OPEN'); if (!openTrades.length) return res.json({ status: 'success', message: 'No open positions', open_count: 0 }); const totalInvested = openTrades.reduce((s, t) => s + (t.investment || 0), 0); const totalPnl = openTrades.reduce((s, t) => s + (t.pnl || 0), 0); const telegram = (db.data.settings || {}).telegram || {}; let telegramSent = false; if (telegram.enabled && telegram.bot_token && telegram.chat_id) { try { await axios.post(`https://api.telegram.org/bot${telegram.bot_token}/sendMessage`, { chat_id: telegram.chat_id, text: `*SQUARE-OFF WARNING*\n\n*${openTrades.length} position(s) still OPEN!*\nTotal Invested: ${Math.round(totalInvested).toLocaleString()}\nUnrealized P&L: ${Math.round(totalPnl).toLocaleString()}\n\n_Market closes at 3:30 PM IST_`, parse_mode: 'Markdown' }, { timeout: 15000 }); telegramSent = true; } catch (err) { console.error('[SquareOff] Telegram error:', err.message); } } if (db.notify) db.notify('exit', 'Square-Off Warning', `${openTrades.length} open position(s)!`); res.json({ status: 'success', open_count: openTrades.length, total_invested: totalInvested, telegram_sent: telegramSent, trades: openTrades.map(t => ({ id: t.id, type: t.trade_type, symbol: t.symbol, qty: t.quantity, entry: t.entry_price, investment: t.investment })) }); } catch (err) { res.json({ status: 'error', message: err.message }); } });

  // ============ Historical Patterns ============
  router.get('/api/historical-patterns', (req, res) => { const patterns = db.data.historical_patterns || []; const total = patterns.length; const profitable = patterns.filter(p => p.was_profitable).length; const sectorStats = {}; for (const p of patterns) { const s = p.sector || 'BROAD_MARKET'; if (!sectorStats[s]) sectorStats[s] = { total: 0, profitable: 0, total_pnl: 0 }; sectorStats[s].total++; if (p.was_profitable) sectorStats[s].profitable++; sectorStats[s].total_pnl += p.pnl || 0; } const sentimentStats = {}; for (const p of patterns) { const s = p.sentiment || 'NEUTRAL'; if (!sentimentStats[s]) sentimentStats[s] = { total: 0, profitable: 0, total_pnl: 0 }; sentimentStats[s].total++; if (p.was_profitable) sentimentStats[s].profitable++; sentimentStats[s].total_pnl += p.pnl || 0; } res.json({ status: 'success', total_patterns: total, profitable_patterns: profitable, win_rate: total ? Math.round((profitable / total) * 1000) / 10 : 0, sector_stats: sectorStats, sentiment_stats: sentimentStats, recent: patterns.slice(-20).reverse() }); });

  // ============ Tax Report ============
  router.get('/api/tax/report', (req, res) => { const fyYear = req.query.fy_year || '2025-26'; const report = calculateTaxReport(db.data.trades || [], fyYear); res.json({ status: 'success', report }); });
  router.get('/api/tax/export-excel', (req, res) => { const fyYear = req.query.fy_year || '2025-26'; const report = calculateTaxReport(db.data.trades || [], fyYear); const headers = 'Month,Trades,Profit,Loss,Net P&L,Turnover,STCG Tax,Cess,Total Tax\n'; const rows = Object.entries(report.monthly_breakdown || {}).map(([m, d]) => `${m},${d.trades},${d.profit},${d.loss},${d.net_pnl},${d.turnover},${d.stcg_tax},${d.cess},${d.total_tax}`).join('\n'); res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename=Tax_Report_FY_${fyYear}.csv`); res.send(headers + rows); });
  router.get('/api/tax/export-pdf', (req, res) => { const fyYear = req.query.fy_year || '2025-26'; const report = calculateTaxReport(db.data.trades || [], fyYear); res.json({ status: 'success', message: 'PDF export via web. Download CSV for desktop.', report }); });

  // ============ Clear Paper Trades ============
  router.delete('/api/trades/clear-paper', (req, res) => { const before = (db.data.trades || []).length; db.data.trades = (db.data.trades || []).filter(t => (t.mode || 'PAPER') === 'LIVE'); const after = db.data.trades.length; const sigBefore = (db.data.signals || []).length; db.data.signals = (db.data.signals || []).filter(s => (s.mode || 'PAPER') === 'LIVE'); db.save(); res.json({ status: 'success', message: `Cleared ${before - after} paper trades`, trades_removed: before - after }); });

  return router;
};
