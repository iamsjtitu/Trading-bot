/**
 * Tax Reporting Routes for Desktop App
 * Capital Gains Tax Reporting for F&O Trading (Indian Tax Laws)
 */
const { Router } = require('express');

module.exports = function (db) {
  const router = Router();

  // Helper: Calculate financial year
  function getFinancialYear(dateStr) {
    const d = new Date(dateStr);
    const month = d.getMonth(); // 0-based
    const year = d.getFullYear();
    return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  }

  // GET /api/tax/report
  router.get('/api/tax/report', (req, res) => {
    const fy = req.query.fy_year || req.query.fy || getFinancialYear(new Date().toISOString());
    const closedTrades = (db.data.trades || []).filter(t => t.status === 'CLOSED' && t.status !== 'FAILED');

    // Filter by financial year
    const fyStart = parseInt(fy.split('-')[0]);
    const startDate = new Date(fyStart, 3, 1).toISOString(); // April 1
    const endDate = new Date(fyStart + 1, 2, 31, 23, 59, 59).toISOString(); // March 31

    const fyTrades = closedTrades.filter(t => {
      const exitTime = t.exit_time || t.updated_at || '';
      return exitTime >= startDate && exitTime <= endDate;
    });

    // Calculations
    let totalTurnover = 0;
    let totalProfit = 0;
    let totalLoss = 0;
    let totalPnl = 0;
    const tradeDetails = [];

    for (const trade of fyTrades) {
      const pnl = trade.pnl || 0;
      const investment = trade.investment || 0;
      const absProfit = Math.abs(pnl);

      totalTurnover += absProfit; // F&O turnover = absolute sum of profits and losses
      if (pnl > 0) totalProfit += pnl;
      else totalLoss += Math.abs(pnl);
      totalPnl += pnl;

      tradeDetails.push({
        symbol: trade.symbol,
        trade_type: trade.trade_type,
        entry_date: trade.entry_time,
        exit_date: trade.exit_time,
        entry_price: trade.entry_price,
        exit_price: trade.exit_price,
        quantity: trade.quantity,
        investment: Math.round(investment * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
      });
    }

    // Tax calculations (Indian F&O tax rules)
    const sttRate = 0.000125; // 0.0125% on sell side
    const stt = Math.round(totalTurnover * sttRate * 100) / 100;
    const transactionCharges = Math.round(totalTurnover * 0.00053 * 100) / 100; // NSE
    const gst = Math.round((transactionCharges + stt * 0.1) * 0.18 * 100) / 100;
    const stampDuty = Math.round(totalTurnover * 0.00003 * 100) / 100;
    const sebiCharges = Math.round(totalTurnover * 0.000001 * 100) / 100;

    const totalCharges = stt + transactionCharges + gst + stampDuty + sebiCharges;
    const netPnl = totalPnl - totalCharges;

    // If net P&L is positive, calculate tax
    let taxableIncome = Math.max(0, netPnl);
    let taxAt30Pct = Math.round(taxableIncome * 0.30 * 100) / 100; // F&O income taxed as business income
    let cess = Math.round(taxAt30Pct * 0.04 * 100) / 100;
    let totalTax = Math.round((taxAt30Pct + cess) * 100) / 100;

    // Advance tax schedule
    const advanceTax = [
      { due_date: `15 Jun ${fyStart}`, pct: 15, amount: Math.round(totalTax * 0.15) },
      { due_date: `15 Sep ${fyStart}`, pct: 45, amount: Math.round(totalTax * 0.45) },
      { due_date: `15 Dec ${fyStart}`, pct: 75, amount: Math.round(totalTax * 0.75) },
      { due_date: `15 Mar ${fyStart + 1}`, pct: 100, amount: Math.round(totalTax) },
    ];

    // Audit requirement (Section 44AB): if turnover > 10 crore (with digital transactions)
    const auditRequired = totalTurnover > 100000000;

    res.json({
      status: 'success',
      report: {
        financial_year: fy,
        total_trades: fyTrades.length,
        total_turnover: Math.round(totalTurnover * 100) / 100,
        total_profit: Math.round(totalProfit * 100) / 100,
        total_loss: Math.round(totalLoss * 100) / 100,
        net_pnl: Math.round(totalPnl * 100) / 100,
        charges: { stt, transaction_charges: transactionCharges, gst, stamp_duty: stampDuty, sebi_charges: sebiCharges, total: Math.round(totalCharges * 100) / 100 },
        net_after_charges: Math.round(netPnl * 100) / 100,
        tax: { taxable_income: taxableIncome, tax_at_30_pct: taxAt30Pct, cess_4_pct: cess, total_tax: totalTax },
        advance_tax_schedule: advanceTax,
        audit_required: auditRequired,
        trade_details: tradeDetails,
      },
    });
  });

  // GET /api/tax/export-excel - Placeholder (generates JSON for now)
  router.get('/api/tax/export-excel', (req, res) => {
    res.json({ status: 'info', message: 'Excel export available in web version. Use Tax Report data for manual filing.' });
  });

  // GET /api/tax/export-pdf - Placeholder
  router.get('/api/tax/export-pdf', (req, res) => {
    res.json({ status: 'info', message: 'PDF export available in web version. Use Tax Report data for manual filing.' });
  });

  return router;
};
