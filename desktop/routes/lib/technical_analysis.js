/**
 * Technical Analysis Module
 * Calculates RSI, MACD, EMA, SMA, VWAP and provides multi-timeframe signals.
 * Ported from Python technical_analysis.py
 */

const INSTRUMENT_KEYS = {
  NIFTY50: 'NSE_INDEX|Nifty 50',
  BANKNIFTY: 'NSE_INDEX|Nifty Bank',
  FINNIFTY: 'NSE_INDEX|Nifty Fin Service',
  MIDCPNIFTY: 'NSE_INDEX|NIFTY MID SELECT',
  SENSEX: 'BSE_INDEX|SENSEX',
  BANKEX: 'BSE_INDEX|BANKEX',
};

function calcSMA(data, period) {
  if (data.length < period) return [];
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(Math.round(sum / period * 100) / 100);
  }
  return result;
}

function calcEMA(data, period) {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const result = new Array(period - 1).fill(null);
  let ema = 0;
  for (let i = 0; i < period; i++) ema += data[i];
  ema /= period;
  result.push(Math.round(ema * 100) / 100);
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    result.push(Math.round(ema * 100) / 100);
  }
  return result;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return { values: [], current: null };
  const deltas = [];
  for (let i = 1; i < closes.length; i++) deltas.push(closes[i] - closes[i - 1]);
  const gains = deltas.map(d => Math.max(d, 0));
  const losses = deltas.map(d => Math.abs(Math.min(d, 0)));

  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) { avgGain += gains[i]; avgLoss += losses[i]; }
  avgGain /= period; avgLoss /= period;

  const rsiValues = new Array(period).fill(null);
  for (let i = period; i < deltas.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    if (avgLoss === 0) { rsiValues.push(100.0); }
    else { const rs = avgGain / avgLoss; rsiValues.push(Math.round((100 - (100 / (1 + rs))) * 100) / 100); }
  }
  return { values: rsiValues, current: rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null };
}

function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  if (closes.length < slow + signal) return { data: {}, current: null };
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);

  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) macdLine.push(Math.round((emaFast[i] - emaSlow[i]) * 100) / 100);
    else macdLine.push(null);
  }
  const validMacd = macdLine.filter(v => v !== null);
  const signalLine = calcEMA(validMacd, signal);
  const pad = macdLine.length - validMacd.length;
  const signalPadded = new Array(pad).fill(null).concat(signalLine);

  const histogram = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null && signalPadded[i] !== null) histogram.push(Math.round((macdLine[i] - signalPadded[i]) * 100) / 100);
    else histogram.push(null);
  }

  const current = {
    macd: macdLine[macdLine.length - 1],
    signal: signalPadded.length > 0 ? signalPadded[signalPadded.length - 1] : null,
    histogram: histogram.length > 0 ? histogram[histogram.length - 1] : null,
  };
  return { data: { macd_line: macdLine, signal_line: signalPadded, histogram }, current };
}

function calcVWAP(highs, lows, closes, volumes) {
  if (!volumes || volumes.length !== closes.length) return { values: [], current: null };
  let cumVol = 0, cumTpVol = 0;
  const vwapValues = [];
  for (let i = 0; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    const vol = volumes[i] || 1;
    cumVol += vol; cumTpVol += tp * vol;
    vwapValues.push(cumVol > 0 ? Math.round(cumTpVol / cumVol * 100) / 100 : null);
  }
  return { values: vwapValues, current: vwapValues.length > 0 ? vwapValues[vwapValues.length - 1] : null };
}

function getSignal(indicator, value, opts = {}) {
  if (indicator === 'EMA_CROSS') {
    const { ema_short, ema_long } = opts;
    if (ema_short && ema_long && ema_short > ema_long) return { signal: 'BULLISH', reason: 'Short EMA above Long EMA' };
    else if (ema_short && ema_long) return { signal: 'BEARISH', reason: 'Short EMA below Long EMA' };
    return { signal: 'NEUTRAL', reason: 'EMA data insufficient' };
  }
  if (value === null || value === undefined) return { signal: 'NEUTRAL', reason: 'Insufficient data' };

  if (indicator === 'RSI') {
    if (value > 70) return { signal: 'BEARISH', reason: `Overbought (${value})` };
    if (value < 30) return { signal: 'BULLISH', reason: `Oversold (${value})` };
    if (value > 60) return { signal: 'BULLISH', reason: `Bullish momentum (${value})` };
    if (value < 40) return { signal: 'BEARISH', reason: `Bearish momentum (${value})` };
    return { signal: 'NEUTRAL', reason: `Neutral range (${value})` };
  }
  if (indicator === 'MACD') {
    const hist = opts.histogram;
    if (hist === null || hist === undefined) return { signal: 'NEUTRAL', reason: 'Insufficient data' };
    if (value > 0 && hist > 0) return { signal: 'BULLISH', reason: 'MACD above signal, positive momentum' };
    if (value < 0 && hist < 0) return { signal: 'BEARISH', reason: 'MACD below signal, negative momentum' };
    if (hist > 0) return { signal: 'BULLISH', reason: 'Histogram turning positive' };
    if (hist < 0) return { signal: 'BEARISH', reason: 'Histogram turning negative' };
    return { signal: 'NEUTRAL', reason: 'MACD at crossover' };
  }
  if (indicator === 'VWAP') {
    const price = opts.price || 0;
    if (price > value * 1.002) return { signal: 'BULLISH', reason: `Price above VWAP (${value})` };
    if (price < value * 0.998) return { signal: 'BEARISH', reason: `Price below VWAP (${value})` };
    return { signal: 'NEUTRAL', reason: `Price near VWAP (${value})` };
  }
  return { signal: 'NEUTRAL', reason: 'Unknown indicator' };
}

function analyzeCandles(candles) {
  if (!candles || candles.length < 2) return { error: 'Insufficient data', indicators: {} };

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume || 0);

  const currentPrice = closes[closes.length - 1];
  const prevClose = closes.length > 1 ? closes[closes.length - 2] : closes[0];
  const change = Math.round((currentPrice - prevClose) * 100) / 100;
  const changePct = prevClose ? Math.round((change / prevClose) * 10000) / 100 : 0;

  const rsi = calcRSI(closes, 14);
  const macd = calcMACD(closes);
  const vwap = calcVWAP(highs, lows, closes, volumes);
  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);

  const rsiSig = getSignal('RSI', rsi.current);
  const macdSig = getSignal('MACD', macd.current?.macd, { histogram: macd.current?.histogram });
  const vwapSig = getSignal('VWAP', vwap.current, { price: currentPrice });
  const emaSig = getSignal('EMA_CROSS', null, {
    ema_short: ema9.length > 0 ? ema9[ema9.length - 1] : null,
    ema_long: ema21.length > 0 ? ema21[ema21.length - 1] : null,
  });

  const signals = [rsiSig.signal, macdSig.signal, vwapSig.signal, emaSig.signal];
  const bullish = signals.filter(s => s === 'BULLISH').length;
  const bearish = signals.filter(s => s === 'BEARISH').length;
  let overall, strength;
  if (bullish > bearish) { overall = 'BULLISH'; strength = Math.round(bullish / signals.length * 100); }
  else if (bearish > bullish) { overall = 'BEARISH'; strength = Math.round(bearish / signals.length * 100); }
  else { overall = 'NEUTRAL'; strength = 50; }

  const recentHighs = highs.length >= 20 ? highs.slice(-20) : highs;
  const recentLows = lows.length >= 20 ? lows.slice(-20) : lows;

  return {
    price: { current: currentPrice, change, change_pct: changePct, high: Math.max(...recentHighs), low: Math.min(...recentLows) },
    indicators: {
      rsi: { value: rsi.current, signal: rsiSig.signal, reason: rsiSig.reason },
      macd: { value: macd.current?.macd, signal_line: macd.current?.signal, histogram: macd.current?.histogram, signal: macdSig.signal, reason: macdSig.reason },
      vwap: { value: vwap.current, signal: vwapSig.signal, reason: vwapSig.reason },
      ema: { ema_9: ema9.length > 0 ? ema9[ema9.length - 1] : null, ema_21: ema21.length > 0 ? ema21[ema21.length - 1] : null, signal: emaSig.signal, reason: emaSig.reason },
      sma: { sma_20: sma20.length > 0 ? sma20[sma20.length - 1] : null, sma_50: sma50.length > 0 ? sma50[sma50.length - 1] : null },
    },
    overall: { signal: overall, strength, bullish_count: bullish, bearish_count: bearish, neutral_count: signals.filter(s => s === 'NEUTRAL').length },
    candle_count: candles.length,
  };
}

function generateDemoCandles(instrument, interval = '5minute', count = 100) {
  const basePrices = { NIFTY50: 24125, BANKNIFTY: 52340, FINNIFTY: 23890, MIDCPNIFTY: 12500, SENSEX: 79850, BANKEX: 56500 };
  const base = basePrices[instrument] || 24000;
  const intervalMins = { '1minute': 1, '5minute': 5, '15minute': 15, '30minute': 30, '1hour': 60, '1day': 1440 };
  const mins = intervalMins[interval] || 5;
  const now = Date.now();

  // Seeded pseudo-random for consistent demo data
  let seed = 42;
  function seededRandom() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function gaussRandom() { let u = 0, v = 0; while (u === 0) u = seededRandom(); while (v === 0) v = seededRandom(); return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v); }

  const candles = [];
  let price = base;
  for (let i = 0; i < count; i++) {
    const ts = new Date(now - mins * (count - i) * 60000);
    const change = gaussRandom() * base * 0.001;
    price = Math.max(price + change, base * 0.95);
    const high = price + Math.abs(gaussRandom() * base * 0.0005);
    const low = price - Math.abs(gaussRandom() * base * 0.0005);
    const open = price + gaussRandom() * base * 0.0003;
    const vol = Math.floor(50000 + seededRandom() * 450000);
    candles.push({
      timestamp: ts.toISOString(),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(price * 100) / 100,
      volume: vol,
    });
  }
  return candles;
}

module.exports = { analyzeCandles, generateDemoCandles, INSTRUMENT_KEYS, calcSMA, calcEMA, calcRSI, calcMACD, calcVWAP };
