/**
 * Smart Position Sizing - Kelly Criterion + Drawdown Management
 */

/**
 * Calculate Kelly Criterion optimal position size
 * f* = (bp - q) / b
 * where b = avg_win/avg_loss, p = win_rate, q = 1-p
 */
function kellyFraction(winRate, avgWin, avgLoss) {
  if (avgLoss === 0 || winRate <= 0 || winRate >= 1) return 0;
  const b = avgWin / avgLoss; // win/loss ratio
  const p = winRate;
  const q = 1 - p;
  const kelly = (b * p - q) / b;
  return Math.max(0, Math.min(0.5, kelly)); // cap at 50%
}

/**
 * Calculate position sizing recommendation
 */
function calculatePositionSize(db) {
  const trades = db.data?.trades || [];
  const closedTrades = trades.filter(t => t.status === 'CLOSED' && t.pnl != null);
  const capital = db.data?.settings?.risk?.capital || db.data?.settings?.risk?.max_portfolio_value || 200000;
  const riskCfg = db.data?.settings?.risk || {};
  const maxPerTrade = riskCfg.max_per_trade || 20000;
  const mode = db.data?.settings?.ai_guards?.position_sizing_mode || 'balanced';

  // Calculate stats from closed trades
  const wins = closedTrades.filter(t => (t.pnl || 0) > 0);
  const losses = closedTrades.filter(t => (t.pnl || 0) < 0);
  const totalTrades = closedTrades.length;
  const winRate = totalTrades > 0 ? wins.length / totalTrades : 0.5;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);

  // Kelly calculation
  const fullKelly = kellyFraction(winRate, avgWin, avgLoss);

  // Mode multipliers
  const modeMultipliers = { conservative: 0.25, balanced: 0.5, aggressive: 0.75 };
  const multiplier = modeMultipliers[mode] || 0.5;
  const adjustedKelly = fullKelly * multiplier;

  // Consecutive loss detection - reduce size during losing streaks
  const recentTrades = closedTrades.slice(-10);
  let consecutiveLosses = 0;
  for (let i = recentTrades.length - 1; i >= 0; i--) {
    if ((recentTrades[i].pnl || 0) < 0) consecutiveLosses++;
    else break;
  }

  // Drawdown adjustment
  let drawdownMultiplier = 1.0;
  if (consecutiveLosses >= 5) drawdownMultiplier = 0.25;     // 5+ losses: 25% size
  else if (consecutiveLosses >= 3) drawdownMultiplier = 0.5;  // 3-4 losses: 50% size
  else if (consecutiveLosses >= 2) drawdownMultiplier = 0.75; // 2 losses: 75% size

  // Winning streak bonus
  let consecutiveWins = 0;
  for (let i = recentTrades.length - 1; i >= 0; i--) {
    if ((recentTrades[i].pnl || 0) > 0) consecutiveWins++;
    else break;
  }
  let streakMultiplier = 1.0;
  if (consecutiveWins >= 5) streakMultiplier = 1.25;     // 5+ wins: 125% size
  else if (consecutiveWins >= 3) streakMultiplier = 1.15;  // 3-4 wins: 115% size

  // Final position size
  const finalKelly = adjustedKelly * drawdownMultiplier * streakMultiplier;
  const suggestedAmount = Math.min(Math.round(capital * finalKelly), maxPerTrade);
  const minAmount = Math.round(capital * 0.02); // minimum 2% of capital

  // Capital curve (last 20 trades)
  const capitalCurve = [];
  let runningCapital = capital - totalPnl; // starting capital
  for (const t of closedTrades.slice(-20)) {
    runningCapital += (t.pnl || 0);
    capitalCurve.push({
      date: t.exit_time || t.entry_time || '',
      capital: Math.round(runningCapital),
      pnl: Math.round(t.pnl || 0),
      symbol: t.symbol || '?',
    });
  }

  // Peak and max drawdown
  let peak = capital - totalPnl;
  let maxDrawdown = 0;
  let currentDrawdown = 0;
  for (const point of capitalCurve) {
    if (point.capital > peak) peak = point.capital;
    currentDrawdown = ((peak - point.capital) / peak) * 100;
    if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
  }

  // Risk of ruin (simplified)
  const riskOfRuin = winRate > 0 && avgWin > 0 ?
    Math.pow((1 - winRate) / winRate, capital / (avgWin || 1)) * 100 : 100;

  return {
    kelly: {
      full_kelly_pct: round2(fullKelly * 100),
      adjusted_kelly_pct: round2(adjustedKelly * 100),
      final_kelly_pct: round2(finalKelly * 100),
      mode,
    },
    suggestion: {
      amount: Math.max(suggestedAmount, minAmount),
      min_amount: minAmount,
      max_amount: maxPerTrade,
      capital,
      pct_of_capital: round2((Math.max(suggestedAmount, minAmount) / capital) * 100),
    },
    stats: {
      total_trades: totalTrades,
      wins: wins.length,
      losses: losses.length,
      win_rate: round2(winRate * 100),
      avg_win: Math.round(avgWin),
      avg_loss: Math.round(avgLoss),
      win_loss_ratio: avgLoss > 0 ? round2(avgWin / avgLoss) : 0,
      total_pnl: Math.round(totalPnl),
      profit_factor: avgLoss > 0 && losses.length > 0 ?
        round2(wins.reduce((s, t) => s + t.pnl, 0) / Math.abs(losses.reduce((s, t) => s + t.pnl, 0))) : 0,
      expectancy: totalTrades > 0 ? Math.round(totalPnl / totalTrades) : 0,
    },
    streak: {
      consecutive_losses: consecutiveLosses,
      consecutive_wins: consecutiveWins,
      drawdown_multiplier: drawdownMultiplier,
      streak_multiplier: streakMultiplier,
      status: consecutiveLosses >= 3 ? 'LOSING_STREAK' : consecutiveWins >= 3 ? 'WINNING_STREAK' : 'NORMAL',
    },
    drawdown: {
      max_drawdown_pct: round2(maxDrawdown),
      current_drawdown_pct: round2(currentDrawdown),
      risk_of_ruin_pct: round2(Math.min(riskOfRuin, 100)),
    },
    capital_curve: capitalCurve,
  };
}

/**
 * Get position size for a specific signal (called from signal_generator)
 */
function getSignalPositionSize(db, signal) {
  const sizing = calculatePositionSize(db);
  const amount = sizing.suggestion.amount;
  const entryPrice = signal.entry_price || 150;
  const lotSize = signal.lot_size || 1;
  const qty = Math.max(lotSize, Math.floor(amount / entryPrice) * lotSize || lotSize);
  const investment = qty * entryPrice;

  return {
    quantity: qty,
    investment: Math.round(investment),
    kelly_pct: sizing.kelly.final_kelly_pct,
    mode: sizing.kelly.mode,
    streak_status: sizing.streak.status,
    drawdown_multiplier: sizing.streak.drawdown_multiplier,
  };
}

function round2(n) { return Math.round(n * 100) / 100; }

module.exports = { calculatePositionSize, getSignalPositionSize, kellyFraction };
