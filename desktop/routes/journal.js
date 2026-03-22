/**
 * AI Trade Journal Routes
 * Auto-reviews every closed trade with GPT-4o, provides insights & patterns.
 */
const { Router } = require('express');
let OpenAI;
try { OpenAI = require('openai'); } catch (_) { OpenAI = null; }

function uuid() { return require('crypto').randomUUID(); }

module.exports = function (db) {
  const router = Router();

  function ensureJournal() {
    if (!db.data.journal_entries) db.data.journal_entries = [];
    if (!db.data.journal_insights) db.data.journal_insights = [];
  }

  function getAIClient() {
    const key = db.data.settings?.ai?.emergent_llm_key || '';
    if (!OpenAI || !key) return null;
    return new OpenAI({ apiKey: key, baseURL: 'https://integrations.emergentagent.com/llm' });
  }

  // ==================== AI REVIEW GENERATION ====================
  async function generateJournalReview(trade) {
    const client = getAIClient();
    if (!client) return getFallbackReview(trade);

    const signal = (db.data.signals || []).find(s => s.id === trade.signal_id);
    const holdMins = trade.entry_time && trade.exit_time
      ? Math.round((new Date(trade.exit_time) - new Date(trade.entry_time)) / 60000) : 0;

    const tradeContext = `
TRADE DATA:
- Type: ${trade.trade_type} (${trade.symbol})
- Entry: Rs.${trade.entry_price} at ${trade.entry_time}
- Exit: Rs.${trade.exit_price} at ${trade.exit_time}
- P&L: Rs.${Math.round(trade.pnl || 0)} (${Math.round(trade.pnl_percentage || 0)}%)
- Hold Duration: ${holdMins} minutes
- Exit Reason: ${trade.exit_reason || 'N/A'}
- Sentiment: ${trade.sentiment || signal?.sentiment || 'N/A'}
- Confidence: ${trade.confidence || signal?.confidence || 'N/A'}%
- Sector: ${trade.sector || signal?.sector || 'BROAD_MARKET'}
- Instrument: ${trade.instrument || signal?.instrument || 'N/A'}
- Mode: ${trade.mode || 'PAPER'}
- Investment: Rs.${Math.round(trade.investment || 0)}
- Stop Loss: Rs.${trade.stop_loss || 'N/A'}
- Target: Rs.${trade.target || 'N/A'}`;

    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert options trading journal analyst for Indian markets (NSE/BSE). 
Analyze the trade and respond ONLY in this exact JSON format (no markdown, no extra text):
{
  "rating": <1-10 integer>,
  "verdict": "<one of: EXCELLENT|GOOD|AVERAGE|POOR|BAD>",
  "what_went_right": "<1-2 sentences>",
  "what_went_wrong": "<1-2 sentences, or 'Nothing major' if profitable>",
  "improvement": "<1 specific actionable tip for next time>",
  "pattern_tags": ["<tag1>", "<tag2>"],
  "risk_assessment": "<1 sentence on risk management quality>",
  "emotion_flag": "<one of: DISCIPLINED|FOMO|REVENGE_TRADE|OVERCONFIDENT|PATIENT|IMPULSIVE|NONE>"
}

RATING GUIDE:
10: Perfect execution, hit target, good timing
8-9: Profitable with minor improvements possible
6-7: Breakeven or small profit/loss, decent execution
4-5: Loss but acceptable risk management
2-3: Significant loss, poor risk management
1: Terrible execution, ignored all signals

PATTERN TAGS (use 1-3): momentum_trade, news_driven, trend_following, counter_trend, breakout, mean_reversion, high_confidence, low_confidence, quick_scalp, swing_trade, overtrading, premature_exit, late_entry, perfect_timing, stop_loss_hit, target_hit`
          },
          { role: 'user', content: tradeContext }
        ],
        max_tokens: 400,
        temperature: 0.3,
      });

      const content = completion.choices?.[0]?.message?.content || '';
      try {
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(cleaned);
      } catch {
        return { ...getFallbackReview(trade), ai_raw: content };
      }
    } catch (err) {
      console.error('[Journal] AI review error:', err.message);
      return getFallbackReview(trade);
    }
  }

  function getFallbackReview(trade) {
    const pnl = trade.pnl || 0;
    const pnlPct = trade.pnl_percentage || 0;
    let rating, verdict;
    if (pnlPct > 20) { rating = 9; verdict = 'EXCELLENT'; }
    else if (pnlPct > 5) { rating = 7; verdict = 'GOOD'; }
    else if (pnlPct > -5) { rating = 5; verdict = 'AVERAGE'; }
    else if (pnlPct > -15) { rating = 3; verdict = 'POOR'; }
    else { rating = 2; verdict = 'BAD'; }

    const tags = [];
    if (trade.exit_reason === 'STOP_LOSS') tags.push('stop_loss_hit');
    else if (trade.exit_reason === 'TARGET_HIT') tags.push('target_hit');
    if (pnl > 0) tags.push('momentum_trade');
    else tags.push('counter_trend');

    return {
      rating, verdict,
      what_went_right: pnl > 0 ? `Profitable trade with ${Math.round(pnlPct)}% return.` : 'Followed the trading system.',
      what_went_wrong: pnl <= 0 ? `Loss of Rs.${Math.abs(Math.round(pnl))}. ${trade.exit_reason === 'STOP_LOSS' ? 'Stop loss triggered.' : 'Market moved against position.'}` : 'Nothing major.',
      improvement: pnl > 0 ? 'Consider trailing stop loss to lock in more profits.' : 'Review entry timing and signal confidence before entering.',
      pattern_tags: tags,
      risk_assessment: trade.stop_loss ? 'Stop loss was set correctly.' : 'Consider always setting a stop loss.',
      emotion_flag: 'NONE',
      source: 'fallback'
    };
  }

  // ==================== AUTO-REVIEW ON TRADE CLOSE ====================
  async function autoReviewTrade(tradeId) {
    ensureJournal();
    const trade = (db.data.trades || []).find(t => t.id === tradeId);
    if (!trade || trade.status !== 'CLOSED') return null;

    // Skip if already reviewed
    if (db.data.journal_entries.some(j => j.trade_id === tradeId)) return null;

    const review = await generateJournalReview(trade);
    const signal = (db.data.signals || []).find(s => s.id === trade.signal_id);

    const entry = {
      id: uuid(),
      trade_id: trade.id,
      symbol: trade.symbol,
      trade_type: trade.trade_type,
      entry_price: trade.entry_price,
      exit_price: trade.exit_price,
      pnl: Math.round((trade.pnl || 0) * 100) / 100,
      pnl_percentage: Math.round((trade.pnl_percentage || 0) * 100) / 100,
      investment: trade.investment,
      hold_duration_mins: trade.entry_time && trade.exit_time
        ? Math.round((new Date(trade.exit_time) - new Date(trade.entry_time)) / 60000) : 0,
      entry_time: trade.entry_time,
      exit_time: trade.exit_time,
      exit_reason: trade.exit_reason,
      sentiment: trade.sentiment || signal?.sentiment || 'N/A',
      confidence: trade.confidence || signal?.confidence || 0,
      sector: trade.sector || signal?.sector || 'BROAD_MARKET',
      instrument: trade.instrument || signal?.instrument || 'N/A',
      mode: trade.mode || 'PAPER',
      // AI Review
      rating: review.rating || 5,
      verdict: review.verdict || 'AVERAGE',
      what_went_right: review.what_went_right || '',
      what_went_wrong: review.what_went_wrong || '',
      improvement: review.improvement || '',
      pattern_tags: review.pattern_tags || [],
      risk_assessment: review.risk_assessment || '',
      emotion_flag: review.emotion_flag || 'NONE',
      ai_source: review.source === 'fallback' ? 'fallback' : 'gpt-4o',
      created_at: new Date().toISOString(),
    };

    db.data.journal_entries.push(entry);
    db.save();
    console.log(`[Journal] Auto-reviewed trade ${tradeId}: ${entry.verdict} (${entry.rating}/10)`);
    return entry;
  }

  // Expose for use in trading.js
  db._autoReviewTrade = autoReviewTrade;

  // ==================== ROUTES ====================

  // GET /api/journal/entries - Get journal entries with filters
  router.get('/api/journal/entries', (req, res) => {
    ensureJournal();
    let entries = [...(db.data.journal_entries || [])];

    // Filters
    const { verdict, sector, instrument, mode, min_rating, max_rating, from, to, limit: lim } = req.query;
    if (verdict) entries = entries.filter(e => e.verdict === verdict.toUpperCase());
    if (sector) entries = entries.filter(e => e.sector === sector.toUpperCase());
    if (instrument) entries = entries.filter(e => (e.instrument || '').toUpperCase().includes(instrument.toUpperCase()));
    if (mode) entries = entries.filter(e => e.mode === mode.toUpperCase());
    if (min_rating) entries = entries.filter(e => e.rating >= parseInt(min_rating));
    if (max_rating) entries = entries.filter(e => e.rating <= parseInt(max_rating));
    if (from) entries = entries.filter(e => (e.created_at || '') >= from);
    if (to) entries = entries.filter(e => (e.created_at || '') <= to + 'T23:59:59');

    entries.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const limit = parseInt(lim) || 50;
    entries = entries.slice(0, limit);

    res.json({ status: 'success', count: entries.length, entries });
  });

  // GET /api/journal/stats - Aggregate stats & patterns (filtered by mode)
  router.get('/api/journal/stats', (req, res) => {
    ensureJournal();
    let entries = db.data.journal_entries || [];
    const { mode } = req.query;
    if (mode) entries = entries.filter(e => e.mode === mode.toUpperCase());
    if (!entries.length) return res.json({ status: 'success', stats: { total: 0 } });

    const profitable = entries.filter(e => e.pnl > 0);
    const losing = entries.filter(e => e.pnl <= 0);
    const avgRating = Math.round(entries.reduce((s, e) => s + (e.rating || 0), 0) / entries.length * 10) / 10;
    const totalPnl = Math.round(entries.reduce((s, e) => s + (e.pnl || 0), 0) * 100) / 100;

    // Tag frequency
    const tagCounts = {};
    for (const e of entries) for (const t of (e.pattern_tags || [])) tagCounts[t] = (tagCounts[t] || 0) + 1;

    // Emotion distribution
    const emotions = {};
    for (const e of entries) emotions[e.emotion_flag || 'NONE'] = (emotions[e.emotion_flag || 'NONE'] || 0) + 1;

    // Verdict distribution
    const verdicts = {};
    for (const e of entries) verdicts[e.verdict || 'AVERAGE'] = (verdicts[e.verdict || 'AVERAGE'] || 0) + 1;

    // Sector performance
    const sectorPerf = {};
    for (const e of entries) {
      const s = e.sector || 'BROAD_MARKET';
      if (!sectorPerf[s]) sectorPerf[s] = { trades: 0, wins: 0, total_pnl: 0, avg_rating: 0, ratings: [] };
      sectorPerf[s].trades++;
      if (e.pnl > 0) sectorPerf[s].wins++;
      sectorPerf[s].total_pnl += e.pnl || 0;
      sectorPerf[s].ratings.push(e.rating || 0);
    }
    for (const s of Object.keys(sectorPerf)) {
      sectorPerf[s].avg_rating = Math.round(sectorPerf[s].ratings.reduce((a, b) => a + b, 0) / sectorPerf[s].ratings.length * 10) / 10;
      sectorPerf[s].win_rate = Math.round((sectorPerf[s].wins / sectorPerf[s].trades) * 100);
      sectorPerf[s].total_pnl = Math.round(sectorPerf[s].total_pnl * 100) / 100;
      delete sectorPerf[s].ratings;
    }

    // Instrument performance
    const instPerf = {};
    for (const e of entries) {
      const i = e.instrument || 'N/A';
      if (!instPerf[i]) instPerf[i] = { trades: 0, wins: 0, total_pnl: 0 };
      instPerf[i].trades++;
      if (e.pnl > 0) instPerf[i].wins++;
      instPerf[i].total_pnl = Math.round((instPerf[i].total_pnl + (e.pnl || 0)) * 100) / 100;
    }
    for (const i of Object.keys(instPerf)) instPerf[i].win_rate = Math.round((instPerf[i].wins / instPerf[i].trades) * 100);

    // Best & worst trades
    const sorted = [...entries].sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
    const bestTrade = sorted[0] || null;
    const worstTrade = sorted[sorted.length - 1] || null;

    res.json({
      status: 'success',
      stats: {
        total: entries.length,
        profitable: profitable.length,
        losing: losing.length,
        win_rate: Math.round((profitable.length / entries.length) * 100),
        avg_rating: avgRating,
        total_pnl: totalPnl,
        avg_pnl: Math.round(totalPnl / entries.length * 100) / 100,
        avg_hold_duration: Math.round(entries.reduce((s, e) => s + (e.hold_duration_mins || 0), 0) / entries.length),
        best_trade: bestTrade ? { symbol: bestTrade.symbol, pnl: bestTrade.pnl, rating: bestTrade.rating } : null,
        worst_trade: worstTrade ? { symbol: worstTrade.symbol, pnl: worstTrade.pnl, rating: worstTrade.rating } : null,
        tag_frequency: tagCounts,
        emotion_distribution: emotions,
        verdict_distribution: verdicts,
        sector_performance: sectorPerf,
        instrument_performance: instPerf,
      },
    });
  });

  // GET /api/journal/insights - AI-powered insights (filtered by mode)
  router.get('/api/journal/insights', async (req, res) => {
    ensureJournal();
    let entries = db.data.journal_entries || [];
    const { mode } = req.query;
    if (mode) entries = entries.filter(e => e.mode === mode.toUpperCase());
    if (entries.length < 2) return res.json({ status: 'success', insights: { message: 'Need at least 2 journal entries for insights.', patterns: [], suggestions: [] } });

    // Compute patterns locally first
    const patterns = [];
    const suggestions = [];

    // Win rate by trade type
    const callTrades = entries.filter(e => e.trade_type === 'CALL' || e.trade_type === 'BUY');
    const putTrades = entries.filter(e => e.trade_type === 'PUT' || e.trade_type === 'SELL');
    const callWinRate = callTrades.length ? Math.round(callTrades.filter(e => e.pnl > 0).length / callTrades.length * 100) : 0;
    const putWinRate = putTrades.length ? Math.round(putTrades.filter(e => e.pnl > 0).length / putTrades.length * 100) : 0;

    if (callTrades.length >= 2 && callWinRate > 65) patterns.push({ type: 'strength', message: `Strong CALL performance: ${callWinRate}% win rate across ${callTrades.length} trades` });
    if (putTrades.length >= 2 && putWinRate > 65) patterns.push({ type: 'strength', message: `Strong PUT performance: ${putWinRate}% win rate across ${putTrades.length} trades` });
    if (callTrades.length >= 2 && callWinRate < 35) patterns.push({ type: 'weakness', message: `Weak CALL performance: ${callWinRate}% win rate. Consider avoiding CALL trades or adjusting entry criteria.` });
    if (putTrades.length >= 2 && putWinRate < 35) patterns.push({ type: 'weakness', message: `Weak PUT performance: ${putWinRate}% win rate. Review PUT entry timing.` });

    // Check for consecutive losses
    const recent = entries.slice(-5);
    const recentLosses = recent.filter(e => e.pnl <= 0).length;
    if (recentLosses >= 4) patterns.push({ type: 'warning', message: `${recentLosses} losses in last 5 trades. Consider pausing and reviewing strategy.` });

    // High confidence vs low confidence performance
    const highConf = entries.filter(e => e.confidence >= 75);
    const lowConf = entries.filter(e => e.confidence < 60 && e.confidence > 0);
    if (highConf.length >= 2 && lowConf.length >= 2) {
      const hcWin = Math.round(highConf.filter(e => e.pnl > 0).length / highConf.length * 100);
      const lcWin = Math.round(lowConf.filter(e => e.pnl > 0).length / lowConf.length * 100);
      if (hcWin > lcWin + 20) patterns.push({ type: 'insight', message: `High-confidence signals (75%+) have ${hcWin}% win rate vs ${lcWin}% for low-confidence. Trust the high-confidence signals more.` });
    }

    // Stop loss vs target hit ratio
    const slHits = entries.filter(e => e.exit_reason === 'STOP_LOSS').length;
    const tgtHits = entries.filter(e => e.exit_reason === 'TARGET_HIT').length;
    if (slHits + tgtHits > 3) {
      if (slHits > tgtHits * 2) suggestions.push('Stop losses hit more than 2x targets. Consider widening stop loss or tightening target.');
      if (tgtHits > slHits * 2) suggestions.push('Great risk-reward execution! Targets hitting more than stop losses.');
    }

    // Overtrading detection
    const tradeDates = {};
    for (const e of entries) { const d = (e.entry_time || '').substring(0, 10); tradeDates[d] = (tradeDates[d] || 0) + 1; }
    const maxDay = Math.max(...Object.values(tradeDates), 0);
    if (maxDay > 10) suggestions.push(`Potential overtrading detected: ${maxDay} trades in a single day. Quality over quantity.`);

    // Average hold duration insights
    const avgHold = Math.round(entries.reduce((s, e) => s + (e.hold_duration_mins || 0), 0) / entries.length);
    if (avgHold < 5 && entries.length > 3) suggestions.push(`Average hold: ${avgHold} minutes. Very short trades — ensure you\'re not panic-exiting.`);

    // Try AI-powered daily insight
    let aiInsight = null;
    const client = getAIClient();
    if (client && entries.length >= 3) {
      try {
        const recentEntries = entries.slice(-10).map(e => `${e.trade_type} ${e.symbol}: Rs.${e.pnl} (${e.verdict}, ${e.rating}/10, ${e.emotion_flag})`).join('\n');
        const completion = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are a trading coach. Given recent trade journal entries, give ONE concise insight (2-3 sentences) about the trader\'s pattern and ONE specific actionable advice. Be encouraging but honest. Keep it under 100 words.' },
            { role: 'user', content: `Recent trades:\n${recentEntries}\n\nOverall stats: ${entries.length} trades, ${Math.round(entries.filter(e => e.pnl > 0).length / entries.length * 100)}% win rate, avg rating ${Math.round(entries.reduce((s, e) => s + e.rating, 0) / entries.length * 10) / 10}/10` },
          ],
          max_tokens: 150,
          temperature: 0.5,
        });
        aiInsight = completion.choices?.[0]?.message?.content || null;
      } catch (err) {
        console.error('[Journal] AI insight error:', err.message);
      }
    }

    res.json({
      status: 'success',
      insights: {
        patterns,
        suggestions,
        ai_insight: aiInsight,
        trade_type_performance: {
          call: { count: callTrades.length, win_rate: callWinRate },
          put: { count: putTrades.length, win_rate: putWinRate },
        },
        stop_loss_hits: slHits,
        target_hits: tgtHits,
        avg_hold_minutes: avgHold,
        max_trades_per_day: maxDay,
      },
    });
  });

  // POST /api/journal/review/:tradeId - Manual trigger for review
  router.post('/api/journal/review/:tradeId', async (req, res) => {
    ensureJournal();
    const { tradeId } = req.params;
    const trade = (db.data.trades || []).find(t => t.id === tradeId);
    if (!trade) return res.json({ status: 'error', message: 'Trade not found' });
    if (trade.status !== 'CLOSED') return res.json({ status: 'error', message: 'Trade is not closed yet' });

    // Remove existing entry if re-reviewing
    db.data.journal_entries = db.data.journal_entries.filter(j => j.trade_id !== tradeId);
    const entry = await autoReviewTrade(tradeId);
    if (entry) return res.json({ status: 'success', entry });
    res.json({ status: 'error', message: 'Failed to generate review' });
  });

  // POST /api/journal/review-all - Review all unreviewed closed trades (filtered by mode)
  router.post('/api/journal/review-all', async (req, res) => {
    ensureJournal();
    const { mode } = req.query;
    let closedTrades = (db.data.trades || []).filter(t => t.status === 'CLOSED');
    if (mode) closedTrades = closedTrades.filter(t => (t.mode || 'PAPER') === mode.toUpperCase());
    const reviewedIds = new Set((db.data.journal_entries || []).map(j => j.trade_id));
    const unreviewed = closedTrades.filter(t => !reviewedIds.has(t.id));

    if (!unreviewed.length) return res.json({ status: 'success', message: 'All trades already reviewed', reviewed: 0 });

    let reviewed = 0;
    const limit = Math.min(unreviewed.length, 10); // Max 10 at a time to avoid timeout
    for (let i = 0; i < limit; i++) {
      const entry = await autoReviewTrade(unreviewed[i].id);
      if (entry) reviewed++;
    }

    res.json({ status: 'success', reviewed, remaining: unreviewed.length - reviewed, message: `Reviewed ${reviewed} trades` });
  });

  return router;
};
