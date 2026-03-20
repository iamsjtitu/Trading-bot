/**
 * Options Greeks Calculator - Black-Scholes Model
 * Calculates Delta, Gamma, Theta, Vega + Implied Volatility
 */

// Standard Normal CDF approximation (Abramowitz & Stegun)
function normCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

// Standard Normal PDF
function normPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Black-Scholes Option Pricing
 * @param {string} type - 'CE' or 'PE'
 * @param {number} S - Current underlying price
 * @param {number} K - Strike price
 * @param {number} T - Time to expiry in years
 * @param {number} r - Risk-free rate (annualized, e.g., 0.07 for 7%)
 * @param {number} sigma - Implied volatility (annualized, e.g., 0.15 for 15%)
 */
function blackScholes(type, S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const nd1 = normCDF(d1);
  const nd2 = normCDF(d2);
  const nPd1 = normPDF(d1);

  let price, delta;
  if (type === 'CE') {
    price = S * nd1 - K * Math.exp(-r * T) * nd2;
    delta = nd1;
  } else {
    price = K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
    delta = nd1 - 1;
  }

  // Gamma (same for call and put)
  const gamma = nPd1 / (S * sigma * sqrtT);

  // Theta (per day)
  const thetaCommon = -(S * nPd1 * sigma) / (2 * sqrtT);
  let theta;
  if (type === 'CE') {
    theta = (thetaCommon - r * K * Math.exp(-r * T) * nd2) / 365;
  } else {
    theta = (thetaCommon + r * K * Math.exp(-r * T) * normCDF(-d2)) / 365;
  }

  // Vega (per 1% move in IV)
  const vega = S * sqrtT * nPd1 / 100;

  return {
    price: round2(price),
    delta: round4(delta),
    gamma: round6(gamma),
    theta: round2(theta),
    vega: round2(vega),
    d1: round4(d1),
    d2: round4(d2),
  };
}

/**
 * Calculate Implied Volatility using Newton-Raphson method
 */
function calcIV(type, marketPrice, S, K, T, r) {
  if (T <= 0 || marketPrice <= 0) return 0;

  let sigma = 0.25; // initial guess 25%
  for (let i = 0; i < 100; i++) {
    const bs = blackScholes(type, S, K, T, r, sigma);
    const diff = bs.price - marketPrice;
    if (Math.abs(diff) < 0.01) break;
    const vega100 = bs.vega * 100; // vega is per 1%, need per 100%
    if (Math.abs(vega100) < 0.0001) break;
    sigma -= diff / vega100;
    sigma = Math.max(0.01, Math.min(5, sigma)); // clamp 1% to 500%
  }
  return round4(sigma);
}

/**
 * Calculate IV Rank (percentile of current IV vs historical)
 * @param {number} currentIV - Current IV
 * @param {number[]} historicalIVs - Array of past IVs
 * @returns {number} IV Rank 0-100
 */
function calcIVRank(currentIV, historicalIVs) {
  if (!historicalIVs || historicalIVs.length === 0) return 50;
  const minIV = Math.min(...historicalIVs);
  const maxIV = Math.max(...historicalIVs);
  if (maxIV === minIV) return 50;
  return round2(((currentIV - minIV) / (maxIV - minIV)) * 100);
}

/**
 * Calculate IV Percentile
 */
function calcIVPercentile(currentIV, historicalIVs) {
  if (!historicalIVs || historicalIVs.length === 0) return 50;
  const below = historicalIVs.filter(iv => iv < currentIV).length;
  return round2((below / historicalIVs.length) * 100);
}

/**
 * Get days to expiry for current week/month expiry
 */
function getDaysToExpiry(expiryDate) {
  if (!expiryDate) {
    // Default: next Thursday (weekly expiry for Nifty/BankNifty)
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    let daysToThursday = (4 - day + 7) % 7;
    if (daysToThursday === 0) {
      // If today is Thursday, check if market is still open
      const istHour = (now.getUTCHours() + 5) % 24 + (now.getUTCMinutes() + 30 >= 60 ? 1 : 0);
      if (istHour >= 15) daysToThursday = 7; // past 3 PM, next week
    }
    return Math.max(daysToThursday, 1);
  }
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diff = (expiry - now) / (1000 * 60 * 60 * 24);
  return Math.max(diff, 0.01);
}

/**
 * Analyze option for trading suitability
 */
function analyzeOption(greeks, iv, ivRank) {
  const warnings = [];
  const recommendations = [];

  // Theta decay warning
  if (greeks.theta < -10) {
    warnings.push(`High theta decay: losing ₹${Math.abs(greeks.theta).toFixed(0)}/day just from time`);
  }

  // IV analysis
  if (ivRank > 80) {
    warnings.push(`IV Rank ${ivRank}% - Options are EXPENSIVE. Avoid buying, consider selling.`);
    recommendations.push('SELL_PREMIUM');
  } else if (ivRank < 20) {
    recommendations.push('BUY_PREMIUM');
  }

  // Delta analysis
  const absDelta = Math.abs(greeks.delta);
  if (absDelta < 0.2) {
    warnings.push('Low delta - option barely moves with underlying. Far OTM.');
  } else if (absDelta > 0.7) {
    recommendations.push('DEEP_ITM');
  }

  // Gamma analysis
  if (greeks.gamma > 0.01) {
    recommendations.push('HIGH_GAMMA');
  }

  return {
    iv_signal: ivRank > 70 ? 'HIGH_IV_AVOID_BUY' : ivRank < 30 ? 'LOW_IV_GOOD_BUY' : 'NORMAL_IV',
    theta_signal: greeks.theta < -5 ? 'HIGH_DECAY_RISK' : 'OK',
    delta_signal: absDelta > 0.3 && absDelta < 0.7 ? 'OPTIMAL_DELTA' : absDelta < 0.2 ? 'LOW_DELTA' : 'HIGH_DELTA',
    warnings,
    recommendations,
    score: calcGreeksScore(greeks, iv, ivRank),
  };
}

function calcGreeksScore(greeks, iv, ivRank) {
  let score = 50; // neutral
  const absDelta = Math.abs(greeks.delta);
  // Prefer delta 0.3-0.6 (ATM to slightly OTM)
  if (absDelta >= 0.3 && absDelta <= 0.6) score += 15;
  else if (absDelta < 0.15) score -= 20;
  // Penalize high theta
  if (greeks.theta < -10) score -= 15;
  else if (greeks.theta > -3) score += 5;
  // Penalize high IV (expensive) for buying
  if (ivRank > 70) score -= 20;
  else if (ivRank < 30) score += 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }
function round6(n) { return Math.round(n * 1000000) / 1000000; }

module.exports = { blackScholes, calcIV, calcIVRank, calcIVPercentile, getDaysToExpiry, analyzeOption };
