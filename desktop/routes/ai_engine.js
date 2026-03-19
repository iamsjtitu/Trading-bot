/**
 * AI Decision Engine - Advanced Trading Intelligence
 * Handles: Signal correlation, market regime detection, multi-timeframe analysis,
 * dynamic position sizing, sector rotation, and AI-powered trade review.
 */

const crypto = require('crypto');
function uuid() { return crypto.randomUUID(); }

class AIDecisionEngine {
  constructor(db) {
    this.db = db;

    // Multi-timeframe sentiment tracking
    this.sentimentWindows = {
      '1h': [],   // last 1 hour
      '4h': [],   // last 4 hours
      'daily': [], // last 24 hours
    };

    // Sector momentum tracker
    this.sectorMomentum = {};

    // Market regime state
    this.marketRegime = 'UNKNOWN'; // TRENDING_UP, TRENDING_DOWN, SIDEWAYS, VOLATILE
    this.regimeConfidence = 0;

    // Signal correlation buffer
    this.signalBuffer = [];

    // Performance tracking for dynamic sizing
    this.recentTradeResults = [];
  }

  // ==================== MARKET REGIME DETECTION ====================

  detectMarketRegime() {
    const sentiments = this.sentimentWindows['4h'];
    if (sentiments.length < 5) {
      this.marketRegime = 'UNKNOWN';
      this.regimeConfidence = 0;
      return this.marketRegime;
    }

    const bullish = sentiments.filter(s => s.sentiment === 'BULLISH').length;
    const bearish = sentiments.filter(s => s.sentiment === 'BEARISH').length;
    const neutral = sentiments.filter(s => s.sentiment === 'NEUTRAL').length;
    const total = sentiments.length;
    const bullPct = bullish / total;
    const bearPct = bearish / total;
    const neutralPct = neutral / total;

    // Check for high confidence variance (volatility indicator)
    const confidences = sentiments.map(s => s.confidence);
    const avgConf = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const variance = confidences.reduce((a, b) => a + Math.pow(b - avgConf, 2), 0) / confidences.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev > 20) {
      this.marketRegime = 'VOLATILE';
      this.regimeConfidence = Math.min(95, 60 + stdDev);
    } else if (bullPct >= 0.65) {
      this.marketRegime = 'TRENDING_UP';
      this.regimeConfidence = Math.round(bullPct * 100);
    } else if (bearPct >= 0.65) {
      this.marketRegime = 'TRENDING_DOWN';
      this.regimeConfidence = Math.round(bearPct * 100);
    } else if (neutralPct >= 0.5 || (Math.abs(bullPct - bearPct) < 0.15)) {
      this.marketRegime = 'SIDEWAYS';
      this.regimeConfidence = Math.round(neutralPct * 100);
    } else {
      this.marketRegime = 'MIXED';
      this.regimeConfidence = 50;
    }

    return this.marketRegime;
  }

  getRegimeMultiplier() {
    const multipliers = {
      'TRENDING_UP': 1.2,    // Increase size in clear trends
      'TRENDING_DOWN': 1.2,
      'SIDEWAYS': 0.6,       // Reduce in sideways (chop risk)
      'VOLATILE': 0.5,       // Reduce in volatile markets
      'MIXED': 0.8,
      'UNKNOWN': 0.7,
    };
    return multipliers[this.marketRegime] || 0.8;
  }

  // ==================== MULTI-TIMEFRAME SENTIMENT ====================

  updateSentimentWindows(sentiment) {
    const now = Date.now();
    const entry = { ...sentiment, timestamp: now };

    this.sentimentWindows['1h'].push(entry);
    this.sentimentWindows['4h'].push(entry);
    this.sentimentWindows['daily'].push(entry);

    // Prune old entries
    this.sentimentWindows['1h'] = this.sentimentWindows['1h'].filter(s => now - s.timestamp < 3600000);
    this.sentimentWindows['4h'] = this.sentimentWindows['4h'].filter(s => now - s.timestamp < 14400000);
    this.sentimentWindows['daily'] = this.sentimentWindows['daily'].filter(s => now - s.timestamp < 86400000);

    // Update regime
    this.detectMarketRegime();
  }

  getTimeframeConfluence(sentiment) {
    const windows = ['1h', '4h', 'daily'];
    let alignedCount = 0;
    const details = {};

    for (const w of windows) {
      const entries = this.sentimentWindows[w];
      if (entries.length < 2) { details[w] = 'INSUFFICIENT_DATA'; continue; }

      const matching = entries.filter(s => s.sentiment === sentiment).length;
      const ratio = matching / entries.length;
      details[w] = { ratio: Math.round(ratio * 100), count: entries.length, matching };

      if (ratio >= 0.6) alignedCount++;
    }

    // Confluence score: 0-100
    const confluenceScore = Math.round((alignedCount / windows.length) * 100);
    return { score: confluenceScore, aligned: alignedCount, total: windows.length, details };
  }

  // ==================== SIGNAL CORRELATION ENGINE ====================

  addToSignalBuffer(signal) {
    this.signalBuffer.push({ ...signal, timestamp: Date.now() });
    // Keep last 30 minutes of signals
    const cutoff = Date.now() - 1800000;
    this.signalBuffer = this.signalBuffer.filter(s => s.timestamp > cutoff);
  }

  getCorrelationScore(newSignal) {
    if (this.signalBuffer.length < 2) return { score: 50, reason: 'Insufficient signals for correlation' };

    const sameDirection = this.signalBuffer.filter(s => s.sentiment === newSignal.sentiment);
    const sameSector = this.signalBuffer.filter(s => s.sector === newSignal.sector);
    const sameDirectionAndSector = this.signalBuffer.filter(s => s.sentiment === newSignal.sentiment && s.sector === newSignal.sector);

    const directionRatio = sameDirection.length / this.signalBuffer.length;
    const sectorRatio = sameSector.length / this.signalBuffer.length;

    // Weighted correlation
    let score = 50;
    score += directionRatio * 30;  // Up to +30 for direction alignment
    score += sectorRatio * 15;     // Up to +15 for sector alignment
    if (sameDirectionAndSector.length >= 2) score += 10; // Bonus for same sector + direction

    // Recency weighting - more recent signals count more
    const recentSignals = this.signalBuffer.filter(s => Date.now() - s.timestamp < 600000); // last 10 min
    const recentSameDir = recentSignals.filter(s => s.sentiment === newSignal.sentiment);
    if (recentSignals.length >= 2 && recentSameDir.length / recentSignals.length >= 0.7) {
      score += 8; // Recent momentum bonus
    }

    score = Math.min(98, Math.round(score));

    const reason = `Direction alignment: ${Math.round(directionRatio * 100)}%, Sector: ${Math.round(sectorRatio * 100)}%, Buffer: ${this.signalBuffer.length} signals`;
    return { score, reason, directionRatio, sectorRatio };
  }

  // ==================== SECTOR ROTATION TRACKER ====================

  updateSectorMomentum(sector, sentiment, confidence) {
    if (!this.sectorMomentum[sector]) {
      this.sectorMomentum[sector] = { bullish: 0, bearish: 0, neutral: 0, signals: 0, avgConfidence: 0, momentum: 0, lastUpdated: Date.now() };
    }

    const sm = this.sectorMomentum[sector];
    sm.signals++;
    sm.avgConfidence = (sm.avgConfidence * (sm.signals - 1) + confidence) / sm.signals;

    if (sentiment === 'BULLISH') sm.bullish++;
    else if (sentiment === 'BEARISH') sm.bearish++;
    else sm.neutral++;

    // Momentum = (bullish - bearish) / total * 100
    sm.momentum = Math.round(((sm.bullish - sm.bearish) / sm.signals) * 100);
    sm.lastUpdated = Date.now();
  }

  getSectorRotationInsight() {
    const sectors = Object.entries(this.sectorMomentum)
      .filter(([_, v]) => v.signals >= 3)
      .sort((a, b) => b[1].momentum - a[1].momentum);

    if (sectors.length === 0) return { leaders: [], laggards: [], rotation: 'NONE' };

    const leaders = sectors.filter(([_, v]) => v.momentum > 30).map(([k, v]) => ({ sector: k, momentum: v.momentum, confidence: Math.round(v.avgConfidence) }));
    const laggards = sectors.filter(([_, v]) => v.momentum < -30).map(([k, v]) => ({ sector: k, momentum: v.momentum, confidence: Math.round(v.avgConfidence) }));

    let rotation = 'NONE';
    if (leaders.length > 0 && laggards.length > 0) rotation = 'ACTIVE';
    else if (leaders.length > 0) rotation = 'BROAD_BULLISH';
    else if (laggards.length > 0) rotation = 'BROAD_BEARISH';

    return { leaders, laggards, rotation, allSectors: sectors.map(([k, v]) => ({ sector: k, ...v })) };
  }

  // ==================== DYNAMIC POSITION SIZING ====================

  updateTradeResult(result) {
    this.recentTradeResults.push({ ...result, timestamp: Date.now() });
    // Keep last 50 trades
    if (this.recentTradeResults.length > 50) this.recentTradeResults.shift();
  }

  calculateDynamicPositionSize(baseSize, confidence, sector) {
    // 1. Confidence-based scaling (Kelly-inspired)
    const confidenceFactor = Math.max(0.3, Math.min(2.0, (confidence - 40) / 40));

    // 2. Win rate adjustment
    const closedTrades = this.recentTradeResults.filter(t => t.pnl !== undefined);
    let winRateFactor = 1.0;
    if (closedTrades.length >= 5) {
      const wins = closedTrades.filter(t => t.pnl > 0).length;
      const winRate = wins / closedTrades.length;
      // Kelly: f = W - (1-W)/R where R is avg win/avg loss ratio
      const avgWin = closedTrades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0) / (wins || 1);
      const avgLoss = Math.abs(closedTrades.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0) / ((closedTrades.length - wins) || 1));
      const R = avgLoss > 0 ? avgWin / avgLoss : 1;
      const kelly = Math.max(0.1, Math.min(0.5, winRate - (1 - winRate) / (R || 1)));
      winRateFactor = 0.5 + kelly; // Scale 0.5 to 1.0
    }

    // 3. Regime multiplier
    const regimeMult = this.getRegimeMultiplier();

    // 4. Sector-specific adjustment
    let sectorMult = 1.0;
    const sectorData = this.sectorMomentum[sector];
    if (sectorData && sectorData.signals >= 5) {
      const sectorWinRate = sectorData.bullish / sectorData.signals;
      if (sectorWinRate > 0.7) sectorMult = 1.15;
      else if (sectorWinRate < 0.3) sectorMult = 0.7;
    }

    // 5. Drawdown protection
    let drawdownMult = 1.0;
    const recent5 = this.recentTradeResults.slice(-5);
    if (recent5.length >= 3) {
      const losses = recent5.filter(t => t.pnl < 0).length;
      if (losses >= 3) drawdownMult = 0.5;  // 3+ consecutive losses → halve size
      else if (losses >= 2) drawdownMult = 0.75;
    }

    const finalSize = Math.round(baseSize * confidenceFactor * winRateFactor * regimeMult * sectorMult * drawdownMult);
    return {
      size: Math.max(1000, finalSize), // Minimum ₹1000
      factors: {
        confidence: Math.round(confidenceFactor * 100) / 100,
        winRate: Math.round(winRateFactor * 100) / 100,
        regime: Math.round(regimeMult * 100) / 100,
        sector: Math.round(sectorMult * 100) / 100,
        drawdown: Math.round(drawdownMult * 100) / 100,
      },
    };
  }

  // ==================== NEWS FRESHNESS DECAY ====================

  calculateFreshnessScore(publishedAt) {
    const pubTime = new Date(publishedAt).getTime();
    const now = Date.now();
    const ageMinutes = (now - pubTime) / 60000;

    // Exponential decay: score = 100 * e^(-age/halfLife)
    // Half-life = 60 minutes (news loses half its value every hour)
    const halfLife = 60;
    const score = 100 * Math.exp(-0.693 * ageMinutes / halfLife);
    return Math.max(5, Math.round(score));
  }

  // ==================== ENHANCED AI PROMPT CONTEXT ====================

  buildEnhancedContext() {
    const regime = this.marketRegime;
    const regimeConf = this.regimeConfidence;
    const rotation = this.getSectorRotationInsight();

    // Recent trade performance
    const recent = this.recentTradeResults.slice(-10);
    const wins = recent.filter(t => t.pnl > 0).length;
    const losses = recent.filter(t => t.pnl <= 0).length;
    const recentPnl = recent.reduce((s, t) => s + (t.pnl || 0), 0);

    // Time of day context
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    const istHour = ist.getUTCHours();
    const istMin = ist.getUTCMinutes();
    let timeContext = 'PRE_MARKET';
    const totalMin = istHour * 60 + istMin;
    if (totalMin >= 555 && totalMin < 615) timeContext = 'OPENING_HOUR';
    else if (totalMin >= 615 && totalMin < 780) timeContext = 'MID_SESSION';
    else if (totalMin >= 780 && totalMin < 870) timeContext = 'AFTERNOON';
    else if (totalMin >= 870 && totalMin <= 930) timeContext = 'CLOSING_HOUR';
    else if (totalMin > 930) timeContext = 'POST_MARKET';

    // Sentiment distribution
    const hourSentiments = this.sentimentWindows['1h'];
    const bullish1h = hourSentiments.filter(s => s.sentiment === 'BULLISH').length;
    const bearish1h = hourSentiments.filter(s => s.sentiment === 'BEARISH').length;

    let ctx = `\n--- MARKET CONTEXT ---`;
    ctx += `\nMarket Regime: ${regime} (${regimeConf}% confidence)`;
    ctx += `\nSession: ${timeContext} (IST ${istHour}:${String(istMin).padStart(2, '0')})`;
    ctx += `\nLast 1h Sentiment: ${bullish1h} bullish, ${bearish1h} bearish out of ${hourSentiments.length}`;

    if (recent.length > 0) {
      ctx += `\nRecent Performance: ${wins}W/${losses}L, Net P&L: ₹${Math.round(recentPnl)}`;
    }

    if (rotation.leaders.length > 0) {
      ctx += `\nSector Leaders: ${rotation.leaders.map(l => `${l.sector}(+${l.momentum})`).join(', ')}`;
    }
    if (rotation.laggards.length > 0) {
      ctx += `\nSector Laggards: ${rotation.laggards.map(l => `${l.sector}(${l.momentum})`).join(', ')}`;
    }

    // Historical patterns
    const patterns = this.db.data?.historical_patterns || [];
    if (patterns.length >= 5) {
      const totalP = patterns.length;
      const profitP = patterns.filter(p => p.was_profitable).length;
      ctx += `\nHistorical Win Rate: ${Math.round((profitP / totalP) * 100)}% (${totalP} trades)`;

      // Best and worst sectors
      const sectorPerf = {};
      for (const p of patterns) {
        const s = p.sector || 'BROAD_MARKET';
        if (!sectorPerf[s]) sectorPerf[s] = { wins: 0, total: 0 };
        sectorPerf[s].total++;
        if (p.was_profitable) sectorPerf[s].wins++;
      }
      const sortedSectors = Object.entries(sectorPerf)
        .filter(([_, v]) => v.total >= 3)
        .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total));
      if (sortedSectors.length > 0) {
        ctx += `\nBest Sector: ${sortedSectors[0][0]} (${Math.round((sortedSectors[0][1].wins / sortedSectors[0][1].total) * 100)}% win rate)`;
      }
    }

    ctx += `\n--- END CONTEXT ---`;
    return ctx;
  }

  // ==================== ENHANCED SYSTEM PROMPT ====================

  getEnhancedSystemPrompt() {
    const context = this.buildEnhancedContext();

    return `You are an elite Indian stock market AI analyst specializing in Nifty 50 & Bank Nifty options trading. You combine fundamental analysis, technical sentiment, and quantitative signals.

ANALYSIS FRAMEWORK:
1. DIRECT IMPACT: How will this news move Nifty/BankNifty in next 1-3 hours?
2. SECTOR CASCADING: Primary sector impact → secondary sector spillover effects
3. INSTITUTIONAL FLOW: FII/DII probable reaction (buying/selling pressure)
4. GLOBAL CORRELATION: Alignment with US futures, Asian markets, crude oil, USD/INR
5. HISTORICAL PATTERN: What happened last time similar news came? Success rate?
6. VOLATILITY ASSESSMENT: Will this increase or decrease option premiums?
7. TIME DECAY RISK: How quickly will this news be priced in?
8. CONTRARIAN CHECK: Is the obvious trade too crowded? Any contrarian signals?

${context}

OUTPUT FORMAT (EXACT):
SENTIMENT: [BULLISH/BEARISH/NEUTRAL]
CONFIDENCE: [0-100]
IMPACT: [HIGH/MEDIUM/LOW]
SECTOR: [BANKING/IT/PHARMA/AUTO/ENERGY/METAL/FMCG/INFRA/REALTY/BROAD_MARKET]
VOLATILITY: [INCREASING/DECREASING/STABLE]
TIME_HORIZON: [IMMEDIATE/SHORT_TERM/MEDIUM_TERM]
REASON: [2-3 lines detailed analysis with specific predictions and reasoning]
TRADING_SIGNAL: [BUY_CALL/BUY_PUT/HOLD]
RISK_LEVEL: [LOW/MEDIUM/HIGH]
SECONDARY_SECTOR: [sector that may be indirectly affected, or NONE]

CONFIDENCE CALIBRATION:
- 90-100: Exceptional clarity - major policy/earnings with strong historical precedent
- 80-89: Strong directional signal - clear FII/DII flow, sector-wide move
- 70-79: Good signal with some uncertainty - single company event with sector impact
- 60-69: Moderate signal - routine data, mixed global cues
- 50-59: Weak/unclear - recommend HOLD unless strong correlation with other signals
- Below 50: Noise - always HOLD

CRITICAL RULES:
- Be conservative. Better to miss a trade than lose money.
- Only BUY_CALL/BUY_PUT when confidence >= 65 AND impact is MEDIUM or HIGH
- In VOLATILE regime, require confidence >= 75
- In SIDEWAYS market, require confidence >= 70
- During CLOSING_HOUR, avoid new trades unless confidence >= 80
- Factor in the recent P&L: if losses are mounting, be more conservative`;
  }

  // ==================== AI-POWERED TRADE REVIEW ====================

  async generateTradeReview(trade, OpenAI, apiKey) {
    if (!OpenAI || !apiKey) return null;

    try {
      const client = new OpenAI({ apiKey, baseURL: 'https://integrations.emergentagent.com/llm' });

      const tradeInfo = `
Trade Type: ${trade.trade_type}
Symbol: ${trade.symbol}
Entry: ₹${trade.entry_price} at ${trade.entry_time}
Exit: ₹${trade.exit_price} at ${trade.exit_time}
P&L: ₹${Math.round(trade.pnl)} (${Math.round(trade.pnl_percentage)}%)
Exit Reason: ${trade.exit_reason}
Original Sentiment: ${trade.sentiment || 'N/A'}
Confidence: ${trade.confidence || 'N/A'}%
Sector: ${trade.sector || 'N/A'}`;

      const completion = await client.chat.completions.create({
        model: 'openai/gpt-4.1-mini',
        messages: [
          { role: 'system', content: 'You are a trading performance analyst. Review this completed trade and provide 2-3 bullet points of insights: what went right, what went wrong, and one actionable takeaway for future trades. Be specific and concise.' },
          { role: 'user', content: tradeInfo },
        ],
        max_tokens: 200,
      });

      return completion.choices?.[0]?.message?.content || null;
    } catch (err) {
      console.error('[AIReview] Error:', err.message);
      return null;
    }
  }

  // ==================== FINAL DECISION SCORING ====================

  computeFinalScore(sentiment, correlation, confluence, freshness, historicalAdj) {
    // Weighted scoring
    const weights = {
      aiConfidence: 0.35,      // AI sentiment confidence
      correlation: 0.20,       // Signal correlation with recent signals
      confluence: 0.20,        // Multi-timeframe alignment
      freshness: 0.15,         // News freshness
      historical: 0.10,        // Historical pattern performance
    };

    const score = Math.round(
      sentiment.confidence * weights.aiConfidence +
      correlation.score * weights.correlation +
      confluence.score * weights.confluence +
      freshness * weights.freshness +
      (50 + historicalAdj * 5) * weights.historical // Convert adj to 0-100 scale
    );

    return Math.max(20, Math.min(98, score));
  }

  // ==================== SUMMARY / DASHBOARD DATA ====================

  getAIInsights() {
    const regime = this.detectMarketRegime();
    const rotation = this.getSectorRotationInsight();
    const confluence1h = this.sentimentWindows['1h'].length;
    const confluence4h = this.sentimentWindows['4h'].length;
    const confluenceDaily = this.sentimentWindows['daily'].length;

    return {
      market_regime: { regime: this.marketRegime, confidence: this.regimeConfidence },
      sector_rotation: rotation,
      sentiment_depth: { '1h': confluence1h, '4h': confluence4h, 'daily': confluenceDaily },
      signal_buffer_size: this.signalBuffer.length,
      recent_trade_count: this.recentTradeResults.length,
      regime_multiplier: this.getRegimeMultiplier(),
    };
  }
}

module.exports = AIDecisionEngine;
