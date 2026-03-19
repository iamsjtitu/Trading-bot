/**
 * Tax Calculator Module
 * Calculates tax reports for F&O trades including broker charges.
 */

const BROKERAGE_PER_ORDER = 20;
const TXN_CHARGE_RATE = 0.0495 / 100;
const SEBI_CHARGE_RATE = 10 / 10_00_00_000;
const STAMP_DUTY_RATE = 0.003 / 100;

function getFYRange(fyYear) {
  const [startYear] = fyYear.split('-').map(Number);
  return { start: new Date(startYear, 3, 1).toISOString(), end: new Date(startYear + 1, 2, 31, 23, 59, 59).toISOString() };
}

function calculateTaxReport(trades, fyYear) {
  const liveTrades = trades.filter(t => (t.mode || 'PAPER') === 'LIVE' && t.status === 'CLOSED' && t.exit_reason !== 'POSITION_CLOSED_ON_BROKER');
  const { start, end } = getFYRange(fyYear);
  const fyTrades = liveTrades.filter(t => (t.exit_time || t.entry_time || '') >= start && (t.exit_time || t.entry_time || '') <= end);

  if (!fyTrades.length) return { fy_year: fyYear, total_trades: 0, net_pnl: 0, total_tax_liability: 0, monthly_breakdown: {}, trade_count: 0, message: 'No LIVE trades found for this period.' };

  const totalBuy = fyTrades.reduce((s, t) => s + (t.investment || 0), 0);
  const totalSell = fyTrades.reduce((s, t) => s + ((t.exit_price || 0) * (t.quantity || 0)), 0);
  const totalPnl = fyTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const wins = fyTrades.filter(t => (t.pnl || 0) > 0);
  const losses = fyTrades.filter(t => (t.pnl || 0) < 0);
  const totalProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const turnover = fyTrades.reduce((s, t) => s + Math.abs(t.pnl || 0), 0);

  // Charges
  const sttPaid = totalSell * 0.000625;
  const numOrders = fyTrades.length * 2;
  const brokerage = numOrders * BROKERAGE_PER_ORDER;
  const txnCharges = Math.round(totalSell * TXN_CHARGE_RATE * 100) / 100;
  const sebiCharges = Math.round(totalSell * SEBI_CHARGE_RATE * 100) / 100;
  const stampDuty = Math.round(totalBuy * STAMP_DUTY_RATE * 100) / 100;
  const gst = Math.round((brokerage + txnCharges + sebiCharges) * 0.18 * 100) / 100;
  const totalCharges = Math.round((sttPaid + brokerage + txnCharges + sebiCharges + stampDuty + gst) * 100) / 100;
  const netPnlAfterCharges = Math.round((totalPnl - totalCharges) * 100) / 100;

  const stcgTax = netPnlAfterCharges > 0 ? netPnlAfterCharges * 0.15 : 0;
  const cess = stcgTax * 0.04;

  // Monthly
  const monthly = {};
  for (const t of fyTrades) {
    const mk = (t.exit_time || t.entry_time || '').slice(0, 7);
    if (!monthly[mk]) monthly[mk] = { trades: 0, profit: 0, loss: 0, net_pnl: 0, turnover: 0, buy_value: 0, sell_value: 0 };
    const m = monthly[mk]; m.trades++;
    const p = t.pnl || 0; m.net_pnl += p; m.turnover += Math.abs(p); m.buy_value += t.investment || 0; m.sell_value += (t.exit_price || 0) * (t.quantity || 0);
    if (p > 0) m.profit += p; else m.loss += Math.abs(p);
  }
  for (const m of Object.values(monthly)) {
    m.stcg_tax = m.net_pnl > 0 ? Math.round(m.net_pnl * 0.15 * 100) / 100 : 0;
    m.cess = Math.round(m.stcg_tax * 0.04 * 100) / 100;
    m.total_tax = Math.round((m.stcg_tax + m.cess) * 100) / 100;
  }

  return {
    fy_year: fyYear, total_trades: fyTrades.length, profitable_trades: wins.length, loss_trades: losses.length,
    win_rate: Math.round((wins.length / fyTrades.length) * 1000) / 10,
    total_buy_value: Math.round(totalBuy * 100) / 100, total_sell_value: Math.round(totalSell * 100) / 100,
    total_profit: Math.round(totalProfit * 100) / 100, total_loss: Math.round(totalLoss * 100) / 100,
    net_pnl: Math.round(totalPnl * 100) / 100, turnover: Math.round(turnover * 100) / 100,
    stt_paid: Math.round(sttPaid * 100) / 100, brokerage: Math.round(brokerage * 100) / 100,
    txn_charges: txnCharges, gst, sebi_charges: sebiCharges, stamp_duty: stampDuty,
    total_charges: totalCharges, net_pnl_after_charges: netPnlAfterCharges,
    stcg_tax: Math.round(stcgTax * 100) / 100, cess: Math.round(cess * 100) / 100,
    total_tax_liability: Math.round((stcgTax + cess) * 100) / 100,
    effective_tax_rate: netPnlAfterCharges > 0 ? Math.round(((stcgTax + cess) / netPnlAfterCharges) * 1000) / 10 : 0,
    audit_required: turnover > 100000000, audit_limit: 100000000,
    monthly_breakdown: Object.fromEntries(Object.entries(monthly).sort()), trade_count: fyTrades.length,
  };
}

module.exports = { calculateTaxReport, getFYRange };
