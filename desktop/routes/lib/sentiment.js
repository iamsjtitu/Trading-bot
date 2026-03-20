/**
 * Sentiment Analysis Module
 * Keyword-based + AI-powered sentiment analysis for market news.
 */
let OpenAI;
try { OpenAI = require('openai'); } catch (_) { OpenAI = null; }

const SECTORS = {
  BANKING: ['bank', 'nifty bank', 'banknifty', 'rbi', 'interest rate', 'repo rate', 'credit', 'loan', 'npa', 'hdfc', 'icici', 'sbi', 'kotak', 'axis bank'],
  IT: ['it sector', 'tech', 'infosys', 'tcs', 'wipro', 'hcl tech', 'software', 'digital', 'ai ', 'artificial intelligence'],
  PHARMA: ['pharma', 'drug', 'medicine', 'health', 'hospital', 'vaccine', 'fda', 'cipla', 'sun pharma', 'dr reddy'],
  AUTO: ['auto', 'vehicle', 'car', 'tata motors', 'maruti', 'mahindra', 'ev ', 'electric vehicle'],
  ENERGY: ['oil', 'gas', 'energy', 'reliance', 'ongc', 'crude', 'petrol', 'diesel', 'power', 'solar', 'renewable'],
  METAL: ['metal', 'steel', 'iron', 'copper', 'aluminium', 'tata steel', 'jsw', 'hindalco', 'vedanta'],
  FMCG: ['fmcg', 'consumer', 'itc', 'hindustan unilever', 'nestle', 'britannia', 'food', 'retail'],
};

function detectSector(text) {
  const t = text.toLowerCase();
  for (const [sector, keywords] of Object.entries(SECTORS)) {
    if (keywords.some(kw => t.includes(kw))) return sector;
  }
  return 'BROAD_MARKET';
}

function parseEnhancedSentiment(text) {
  const result = { sentiment: 'NEUTRAL', confidence: 50, impact: 'LOW', sector: 'BROAD_MARKET', reason: '', trading_signal: 'HOLD', volatility: 'STABLE', time_horizon: 'SHORT_TERM', risk_level: 'MEDIUM', secondary_sector: 'NONE' };
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (l.startsWith('SENTIMENT:')) result.sentiment = l.split(':').slice(1).join(':').trim();
    else if (l.startsWith('CONFIDENCE:')) result.confidence = parseInt(l.split(':').slice(1).join(':').trim()) || 50;
    else if (l.startsWith('IMPACT:')) result.impact = l.split(':').slice(1).join(':').trim();
    else if (l.startsWith('SECTOR:')) result.sector = l.split(':').slice(1).join(':').trim();
    else if (l.startsWith('REASON:')) result.reason = l.split(':').slice(1).join(':').trim();
    else if (l.startsWith('TRADING_SIGNAL:')) result.trading_signal = l.split(':').slice(1).join(':').trim();
    else if (l.startsWith('VOLATILITY:')) result.volatility = l.split(':').slice(1).join(':').trim();
    else if (l.startsWith('TIME_HORIZON:')) result.time_horizon = l.split(':').slice(1).join(':').trim();
    else if (l.startsWith('RISK_LEVEL:')) result.risk_level = l.split(':').slice(1).join(':').trim();
    else if (l.startsWith('SECONDARY_SECTOR:')) result.secondary_sector = l.split(':').slice(1).join(':').trim();
  }
  return result;
}

module.exports = function createSentimentAnalyzer(db, aiEngine) {
  const recentSentiments = [];

  function getTrendAdjustment(currentSentiment) {
    if (recentSentiments.length < 3) return 0;
    const recent = recentSentiments.slice(-5);
    const sameCount = recent.filter(s => s.sentiment === currentSentiment).length;
    if (sameCount >= 4) return 8;
    if (sameCount >= 3) return 4;
    if (sameCount <= 1) return -5;
    return 0;
  }

  function keywordSentiment(article) {
    const text = `${article.title || ''} ${article.description || ''}`.toLowerCase();
    const bullishHigh = ['all-time high', 'record high', 'massive rally', 'strong earnings', 'rate cut', 'fii buying', 'breakout'];
    const bullishMid = ['rally', 'surge', 'gain', 'bull', 'positive', 'boost', 'growth', 'profit', 'upgrade', 'outperform', 'recovery', 'inflows', 'green', 'uptrend', 'bullish', 'optimism'];
    const bullishLow = ['rise', 'high', 'strong', 'buy', 'good', 'better', 'stable'];
    const bearishHigh = ['crash', 'panic selling', 'circuit break', 'recession', 'rate hike', 'fii selling', 'meltdown'];
    const bearishMid = ['fall', 'drop', 'decline', 'bear', 'negative', 'weak', 'loss', 'fear', 'downgrade', 'underperform', 'correction', 'outflows', 'red', 'downtrend', 'bearish', 'pressure', 'slump'];
    const bearishLow = ['sell', 'low', 'warning', 'concern', 'risk', 'inflation', 'uncertainty'];

    let bullScore = bullishHigh.filter(kw => text.includes(kw)).length * 3 + bullishMid.filter(kw => text.includes(kw)).length * 2 + bullishLow.filter(kw => text.includes(kw)).length;
    let bearScore = bearishHigh.filter(kw => text.includes(kw)).length * 3 + bearishMid.filter(kw => text.includes(kw)).length * 2 + bearishLow.filter(kw => text.includes(kw)).length;

    const total = bullScore + bearScore;
    const sector = detectSector(text);
    if (total === 0) return { sentiment: 'NEUTRAL', confidence: 50, impact: 'LOW', sector, reason: 'No strong keywords detected (keyword analysis)', trading_signal: 'HOLD' };

    const dominant = bullScore > bearScore ? 'BULLISH' : bearScore > bullScore ? 'BEARISH' : 'NEUTRAL';
    const diff = Math.abs(bullScore - bearScore);
    let confidence = Math.max(30, Math.min(95, Math.min(90, 50 + diff * 5) + getTrendAdjustment(dominant)));
    const impact = diff >= 6 ? 'HIGH' : diff >= 3 ? 'MEDIUM' : 'LOW';

    let signal = 'HOLD';
    if (dominant === 'BULLISH' && confidence >= 63 && impact !== 'LOW') signal = 'BUY_CALL';
    else if (dominant === 'BEARISH' && confidence >= 63 && impact !== 'LOW') signal = 'BUY_PUT';

    const allKw = dominant === 'BULLISH' ? [...bullishHigh, ...bullishMid] : [...bearishHigh, ...bearishMid];
    const matched = allKw.filter(kw => text.includes(kw)).slice(0, 4);
    const reason = dominant !== 'NEUTRAL' ? `${dominant.charAt(0) + dominant.slice(1).toLowerCase()} signals [${sector}]: ${matched.join(', ')} (keyword analysis)` : `Mixed signals [${sector}] (keyword analysis)`;
    return { sentiment: dominant, confidence, impact, sector, reason, trading_signal: signal };
  }

  function computeEnhancedSignal(result) {
    const regime = aiEngine.marketRegime;
    const composite = result.composite_score || result.confidence;
    const impact = result.impact || 'LOW';
    const sentiment = result.sentiment;
    let minConfidence = 65;
    if (regime === 'VOLATILE') minConfidence = 75;
    else if (regime === 'SIDEWAYS') minConfidence = 70;
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const totalMin = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    if (totalMin >= 870 && totalMin <= 930) minConfidence = 80;
    if (composite >= minConfidence && impact !== 'LOW') {
      if (sentiment === 'BULLISH') return 'BUY_CALL';
      if (sentiment === 'BEARISH') return 'BUY_PUT';
    }
    return 'HOLD';
  }

  function getHistoricalAdjustment(sector, sentiment) {
    const patterns = db.data.historical_patterns || [];
    const matching = patterns.filter(p => p.sector === sector && p.sentiment === sentiment);
    if (matching.length < 3) return 0;
    const winRate = matching.filter(p => p.was_profitable).length / matching.length;
    if (winRate >= 0.7) return 5;
    if (winRate <= 0.3) return -8;
    return 0;
  }

  async function analyzeSentiment(article) {
    const aiKey = db.data.settings?.ai?.emergent_llm_key || '';
    const freshnessScore = aiEngine.calculateFreshnessScore(article.published_at || new Date().toISOString());

    if (aiKey && OpenAI) {
      try {
        const client = new OpenAI({ apiKey: aiKey, baseURL: 'https://integrations.emergentagent.com/llm' });
        const systemMsg = aiEngine.getEnhancedSystemPrompt();
        const userMsg = `Title: ${article.title || ''}\nDescription: ${article.description || ''}\nSource: ${article.source || ''}\nPublished: ${article.published_at || ''}\nFreshness Score: ${freshnessScore}/100`;
        const completion = await client.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }], max_tokens: 500 });
        const result = parseEnhancedSentiment(completion.choices?.[0]?.message?.content || '');

        const trendAdj = getTrendAdjustment(result.sentiment);
        result.confidence = Math.max(30, Math.min(98, result.confidence + trendAdj));
        if (trendAdj !== 0) result.trend_note = `Confidence adjusted by ${trendAdj > 0 ? '+' : ''}${trendAdj} based on recent trend`;
        if (!result.sector) result.sector = detectSector(`${article.title || ''} ${article.description || ''}`);

        aiEngine.updateSentimentWindows(result);
        aiEngine.updateSectorMomentum(result.sector, result.sentiment, result.confidence);
        aiEngine.addToSignalBuffer(result);

        const correlation = aiEngine.getCorrelationScore(result);
        result.correlation_score = correlation.score;
        result.correlation_detail = correlation.reason;
        const confluence = aiEngine.getTimeframeConfluence(result.sentiment);
        result.confluence_score = confluence.score;
        result.confluence_aligned = confluence.aligned;

        const historicalAdj = getHistoricalAdjustment(result.sector, result.sentiment);
        result.composite_score = aiEngine.computeFinalScore(result, correlation, confluence, freshnessScore, historicalAdj);
        result.freshness_score = freshnessScore;
        result.market_regime = aiEngine.marketRegime;
        result.trading_signal = computeEnhancedSignal(result);

        recentSentiments.push(result);
        if (recentSentiments.length > 20) recentSentiments.splice(0, recentSentiments.length - 20);
        return result;
      } catch (err) {
        console.error('[Sentiment] AI error:', err.message, '- Model: gpt-4o, Key present:', !!aiKey);
        console.error('[Sentiment] Falling back to keyword-based analysis');
      }
    }

    // Fallback: keyword-based
    const result = keywordSentiment(article);
    result.freshness_score = freshnessScore;
    aiEngine.updateSentimentWindows(result);
    aiEngine.updateSectorMomentum(result.sector, result.sentiment, result.confidence);
    aiEngine.addToSignalBuffer(result);
    const correlation = aiEngine.getCorrelationScore(result);
    result.correlation_score = correlation.score;
    const confluence = aiEngine.getTimeframeConfluence(result.sentiment);
    result.confluence_score = confluence.score;
    result.market_regime = aiEngine.marketRegime;
    result.trading_signal = computeEnhancedSignal(result);
    recentSentiments.push(result);
    if (recentSentiments.length > 20) recentSentiments.splice(0, recentSentiments.length - 20);
    return result;
  }

  return { analyzeSentiment, keywordSentiment, detectSector, computeEnhancedSignal, getHistoricalAdjustment };
};
