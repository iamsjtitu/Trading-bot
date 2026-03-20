import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import axios from 'axios';
import { FaFileExcel, FaCalendarAlt, FaChartBar, FaLink, FaDatabase, FaSync, FaChevronDown, FaChevronUp } from 'react-icons/fa';

const BACKEND_URL = (() => {
  const envUrl = process.env.REACT_APP_BACKEND_URL || '';
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) return '';
  return envUrl;
})();
const API = `${BACKEND_URL}/api`;

function getCurrentFY() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month >= 3) return `${year}-${String(year + 1).slice(2)}`;
  return `${year - 1}-${String(year).slice(2)}`;
}

function getFYOptions() {
  const current = new Date().getFullYear();
  const options = [];
  for (let y = current + 1; y >= current - 3; y--) {
    options.push(`${y}-${String(y + 1).slice(2)}`);
  }
  return options;
}

export default function TaxReports({ formatCurrency }) {
  const [fyYear, setFyYear] = useState(getCurrentFY());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('summary');
  const [showTrades, setShowTrades] = useState(false);

  const fmt = (v) => {
    if (v == null || isNaN(v)) return '0';
    return formatCurrency ? formatCurrency(v) : `₹${Math.round(v || 0).toLocaleString('en-IN')}`;
  };

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API}/tax/report`, {
        params: { fy_year: fyYear, segment: 'FO' },
        timeout: 60000,
      });
      if (res.data?.status === 'success' && res.data?.report) {
        const raw = res.data.report;
        const s = raw.summary || {};
        const c = raw.charges || {};
        const t = raw.tax || {};
        const comp = raw.compliance || {};
        const trades = raw.trade_details || [];
        const winCount = trades.filter(tr => (tr.pnl || 0) > 0).length;

        setReport({
          source: res.data.source,
          financial_year: raw.financial_year,
          segment: raw.segment,
          total_trades: raw.total_trades || 0,
          expected_trades: raw.expected_trades || 0,

          // Summary
          total_buy_value: s.total_buy_value || 0,
          total_sell_value: s.total_sell_value || 0,
          total_turnover: s.total_turnover || 0,
          total_profit: s.total_profit || 0,
          total_loss: s.total_loss || 0,
          gross_pnl: s.combined_gross_pnl ?? s.gross_pnl_settled ?? 0,
          today_pnl: s.today_pnl || 0,

          // Charges
          charges_source: c.source || 'unknown',
          brokerage: c.brokerage || 0,
          stt: c.stt || 0,
          transaction_charges: c.transaction_charges || 0,
          gst: c.gst || 0,
          stamp_duty: c.stamp_duty || 0,
          sebi_charges: c.sebi_charges || 0,
          ipft: c.ipft || 0,
          other_charges: c.other_charges || 0,
          total_charges: c.total_charges || 0,

          // Net
          net_pnl: raw.net_pnl_after_charges ?? 0,

          // Tax
          taxable_income: t.taxable_income || 0,
          tax_at_30_pct: t.tax_at_30_pct || 0,
          cess: t.health_cess_4_pct || 0,
          surcharge: t.surcharge_if_applicable || 0,
          total_tax: t.total_tax_liability || 0,
          effective_tax_rate: t.effective_tax_rate || 0,

          // Compliance
          itr_form: comp.itr_form || 'ITR-3',
          audit_required: comp.audit_required || false,
          due_date: comp.due_date || '',

          // Trade details
          trade_details: trades,
          win_rate: raw.total_trades > 0 ? Math.round(winCount / raw.total_trades * 1000) / 10 : 0,

          // Monthly breakdown (built from trades)
          monthly_breakdown: buildMonthlyBreakdown(trades),

          // Advance tax
          advance_tax_schedule: raw.advance_tax_schedule || [],

          // Today positions
          today_positions: raw.today_positions || [],
        });
      } else {
        setError(res.data?.message || 'Failed to load report');
      }
    } catch (e) {
      console.error('Tax report error:', e);
      setError(e.response?.data?.message || e.message || 'Failed to fetch tax report');
    } finally {
      setLoading(false);
    }
  }, [fyYear]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const buildMonthlyBreakdown = (trades) => {
    const months = {};
    for (const t of trades) {
      const dateStr = t.sell_date || t.buy_date || '';
      // Parse dd-mm-yyyy or yyyy-mm-dd
      let d;
      if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [dd, mm, yyyy] = dateStr.split('-');
        d = new Date(yyyy, parseInt(mm) - 1, dd);
      } else {
        d = new Date(dateStr);
      }
      if (isNaN(d)) continue;
      const key = d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
      if (!months[key]) months[key] = { trades: 0, profit: 0, loss: 0, net_pnl: 0, turnover: 0 };
      months[key].trades++;
      const pnl = t.pnl || 0;
      if (pnl > 0) months[key].profit += pnl;
      else months[key].loss += Math.abs(pnl);
      months[key].net_pnl += pnl;
      months[key].turnover += Math.abs(pnl);
    }
    for (const m of Object.values(months)) {
      m.profit = Math.round(m.profit * 100) / 100;
      m.loss = Math.round(m.loss * 100) / 100;
      m.net_pnl = Math.round(m.net_pnl * 100) / 100;
      m.turnover = Math.round(m.turnover * 100) / 100;
    }
    return months;
  };

  if (loading && !report) {
    return <Card className="p-8 text-center" data-testid="tax-loading"><p className="text-gray-500">Loading tax report from Upstox...</p></Card>;
  }

  return (
    <div className="space-y-4" data-testid="tax-reports-page">
      {/* Controls */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FaCalendarAlt className="text-blue-600" />
            <select value={fyYear} onChange={e => setFyYear(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium" data-testid="fy-selector">
              {getFYOptions().map(fy => <option key={fy} value={fy}>FY {fy}</option>)}
            </select>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setViewMode('summary')} className={`px-3 py-1 text-xs rounded-md font-medium transition ${viewMode === 'summary' ? 'bg-white shadow text-blue-700' : 'text-gray-600'}`} data-testid="view-summary-btn">Summary</button>
              <button onClick={() => setViewMode('monthly')} className={`px-3 py-1 text-xs rounded-md font-medium transition ${viewMode === 'monthly' ? 'bg-white shadow text-blue-700' : 'text-gray-600'}`} data-testid="view-monthly-btn">Monthly</button>
              <button onClick={() => setViewMode('trades')} className={`px-3 py-1 text-xs rounded-md font-medium transition ${viewMode === 'trades' ? 'bg-white shadow text-blue-700' : 'text-gray-600'}`} data-testid="view-trades-btn">Trades</button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <Badge className={`gap-1.5 px-3 py-1 text-xs font-semibold ${report.source === 'upstox' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`} data-testid="data-source-badge">
                {report.source === 'upstox' ? <><FaLink className="text-[10px]" /> Upstox Live</> : <><FaDatabase className="text-[10px]" /> Local Data</>}
              </Badge>
            )}
            <Button onClick={fetchReport} disabled={loading} variant="outline" size="sm" className="gap-1.5" data-testid="refresh-tax-btn">
              <FaSync className={loading ? 'animate-spin' : ''} /> {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </Card>

      {error && (
        <Card className="p-4 border-red-200 bg-red-50" data-testid="tax-error">
          <p className="text-red-600 text-sm">{error}</p>
        </Card>
      )}

      {!report || (report.total_trades === 0 && !loading) ? (
        <Card className="p-8 text-center" data-testid="no-tax-data">
          <FaChartBar className="mx-auto text-4xl text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No F&O trades in FY {fyYear}</p>
          <p className="text-gray-400 text-sm mt-1">Tax report will appear once trades are settled by Upstox</p>
        </Card>
      ) : viewMode === 'summary' ? (
        <SummaryView report={report} fmt={fmt} />
      ) : viewMode === 'monthly' ? (
        <MonthlyView report={report} fmt={fmt} />
      ) : (
        <TradesView report={report} fmt={fmt} showTrades={showTrades} setShowTrades={setShowTrades} />
      )}
    </div>
  );
}

function SummaryView({ report, fmt }) {
  return (
    <>
      {/* Top summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="tax-summary-cards">
        <Card className="p-4 border-l-4 border-l-blue-500">
          <p className="text-xs text-gray-500 font-medium">Total Trades</p>
          <p className="text-xl font-bold text-gray-800 mt-1" data-testid="total-trades-count">{report.total_trades}</p>
          <p className="text-xs text-gray-400">Win Rate: {report.win_rate}%</p>
        </Card>
        <Card className={`p-4 border-l-4 ${report.gross_pnl >= 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
          <p className="text-xs text-gray-500 font-medium">Gross P&L</p>
          <p className={`text-xl font-bold mt-1 ${report.gross_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="gross-pnl-value">
            {report.gross_pnl >= 0 ? '+' : ''}{fmt(report.gross_pnl)}
          </p>
          <p className="text-xs text-gray-400">Profit: {fmt(report.total_profit)} | Loss: {fmt(report.total_loss)}</p>
        </Card>
        <Card className={`p-4 border-l-4 ${report.net_pnl >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
          <p className="text-xs text-gray-500 font-medium">Net P&L (after charges)</p>
          <p className={`text-xl font-bold mt-1 ${report.net_pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`} data-testid="net-pnl-value">
            {report.net_pnl >= 0 ? '+' : ''}{fmt(report.net_pnl)}
          </p>
          <p className="text-xs text-gray-400">Charges: {fmt(report.total_charges)}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-orange-500">
          <p className="text-xs text-gray-500 font-medium">Tax Liability</p>
          <p className="text-xl font-bold text-orange-600 mt-1" data-testid="tax-liability-value">{fmt(report.total_tax)}</p>
          <p className="text-xs text-gray-400">Rate: {report.effective_tax_rate}%</p>
        </Card>
      </div>

      {/* Detailed cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Charges Card */}
        <Card className="p-5" data-testid="broker-charges-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800 text-base">Broker Charges</h3>
            <Badge className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5">{report.charges_source}</Badge>
          </div>
          <div className="space-y-2">
            {[
              ['Brokerage', report.brokerage],
              ['STT', report.stt],
              ['Transaction Charges', report.transaction_charges],
              ['GST (18%)', report.gst],
              ['SEBI Charges', report.sebi_charges],
              ['Stamp Duty', report.stamp_duty],
              ['Other Charges', report.other_charges],
            ].filter(([, val]) => (val || 0) > 0 || true).map(([label, val]) => (
              <div key={label} className="flex justify-between py-1.5 border-b border-gray-50">
                <span className="text-sm text-gray-600">{label}</span>
                <span className="text-sm text-gray-800">{fmt(val || 0)}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 bg-red-50 rounded px-2 -mx-2">
              <span className="text-sm font-bold text-gray-800">Total Charges</span>
              <span className="text-sm font-bold text-red-600" data-testid="total-charges-value">{fmt(report.total_charges)}</span>
            </div>
          </div>
        </Card>

        {/* Tax Calculation Card */}
        <Card className="p-5" data-testid="tax-calculation-card">
          <h3 className="font-bold text-gray-800 mb-4 text-base">Tax Calculation</h3>
          <div className="space-y-2">
            <div className="flex justify-between py-1.5 border-b border-gray-100">
              <span className="text-sm text-gray-600">Gross P&L</span>
              <span className={`text-sm font-semibold ${report.gross_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{report.gross_pnl >= 0 ? '+' : ''}{fmt(report.gross_pnl)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100">
              <span className="text-sm text-gray-600">Less: Charges</span>
              <span className="text-sm text-red-600">-{fmt(report.total_charges)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700">Taxable Income</span>
              <span className={`text-sm font-bold ${report.taxable_income > 0 ? 'text-green-600' : 'text-gray-500'}`}>{fmt(report.taxable_income)}</span>
            </div>
            {report.taxable_income > 0 ? (
              <>
                <div className="flex justify-between py-1.5 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Business Income Tax @30%</span>
                  <span className="text-sm font-semibold text-gray-800">{fmt(report.tax_at_30_pct)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Health & Ed. Cess @4%</span>
                  <span className="text-sm font-semibold text-gray-800">{fmt(report.cess)}</span>
                </div>
                {report.surcharge > 0 && (
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Surcharge @10%</span>
                    <span className="text-sm font-semibold text-gray-800">{fmt(report.surcharge)}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="py-2 text-center text-sm text-green-600 bg-green-50 rounded">
                No tax applicable (Net P&L is negative)
              </div>
            )}
            <div className="flex justify-between py-2 bg-orange-50 rounded px-2 -mx-2">
              <span className="text-sm font-bold text-gray-800">Total Tax</span>
              <span className="text-base font-bold text-orange-600">{fmt(report.total_tax)}</span>
            </div>
          </div>
        </Card>

        {/* Trading Summary Card */}
        <Card className="p-5" data-testid="tax-trading-summary-card">
          <h3 className="font-bold text-gray-800 mb-4 text-base">Trading Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between py-1.5 border-b border-gray-100">
              <span className="text-sm text-gray-600">Total Buy Value</span>
              <span className="text-sm font-semibold">{fmt(report.total_buy_value)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100">
              <span className="text-sm text-gray-600">Total Sell Value</span>
              <span className="text-sm font-semibold">{fmt(report.total_sell_value)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100">
              <span className="text-sm text-gray-600">Total Profit</span>
              <span className="text-sm font-bold text-green-600">+{fmt(report.total_profit)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100">
              <span className="text-sm text-gray-600">Total Loss</span>
              <span className="text-sm font-bold text-red-600">-{fmt(report.total_loss)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100">
              <span className="text-sm text-gray-600">F&O Turnover</span>
              <span className="text-sm font-semibold">{fmt(report.total_turnover)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100">
              <span className="text-sm text-gray-600">ITR Form</span>
              <Badge className="bg-blue-100 text-blue-700 text-xs">{report.itr_form}</Badge>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-sm text-gray-600">Tax Audit</span>
              {report.audit_required
                ? <Badge className="bg-red-100 text-red-700 text-xs">Required</Badge>
                : <span className="text-xs text-green-600">Not Required</span>
              }
            </div>
            {report.due_date && (
              <div className="flex justify-between py-1.5 bg-blue-50 rounded px-2 -mx-2">
                <span className="text-sm text-gray-700">Filing Due Date</span>
                <span className="text-sm font-semibold text-blue-700">{report.due_date}</span>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Today's positions info */}
      {report.today_pnl !== 0 && (
        <Card className="p-4 bg-yellow-50 border-yellow-200" data-testid="today-pnl-notice">
          <p className="text-sm text-yellow-800">
            Today's unsettled P&L of <span className={`font-bold ${report.today_pnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(report.today_pnl)}</span> is included in Gross P&L. This will be confirmed after market settlement.
          </p>
        </Card>
      )}

      <p className="text-xs text-gray-400 italic px-1" data-testid="tax-disclaimer">
        Disclaimer: This report is auto-generated for informational purposes. Consult a CA for actual tax filing. F&O income is non-speculative business income taxed at slab rates. ITR-3 applicable. Charges shown are from {report.charges_source === 'upstox_api' ? 'Upstox' : 'manual calculation'}.
      </p>
    </>
  );
}

function MonthlyView({ report, fmt }) {
  const months = report.monthly_breakdown || {};
  const monthEntries = Object.entries(months);

  if (monthEntries.length === 0) {
    return (
      <Card className="p-8 text-center" data-testid="no-monthly-data">
        <p className="text-gray-500">No monthly breakdown available</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-0 overflow-hidden" data-testid="monthly-tax-table">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Month</th>
                <th className="px-4 py-3 text-center font-semibold">Trades</th>
                <th className="px-4 py-3 text-right font-semibold">Profit</th>
                <th className="px-4 py-3 text-right font-semibold">Loss</th>
                <th className="px-4 py-3 text-right font-semibold">Net P&L</th>
                <th className="px-4 py-3 text-right font-semibold">Turnover</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {monthEntries.map(([month, d]) => (
                <tr key={month} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{month}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{d.trades}</td>
                  <td className="px-4 py-3 text-right text-green-600 font-semibold">+{fmt(d.profit)}</td>
                  <td className="px-4 py-3 text-right text-red-600 font-semibold">-{fmt(d.loss)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${d.net_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{d.net_pnl >= 0 ? '+' : ''}{fmt(d.net_pnl)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmt(d.turnover)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-100">
              <tr className="font-bold">
                <td className="px-4 py-3 text-gray-800">TOTAL</td>
                <td className="px-4 py-3 text-center text-gray-800">{report.total_trades}</td>
                <td className="px-4 py-3 text-right text-green-600">+{fmt(report.total_profit)}</td>
                <td className="px-4 py-3 text-right text-red-600">-{fmt(report.total_loss)}</td>
                <td className={`px-4 py-3 text-right ${report.gross_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{report.gross_pnl >= 0 ? '+' : ''}{fmt(report.gross_pnl)}</td>
                <td className="px-4 py-3 text-right text-gray-800">{fmt(report.total_turnover)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <p className="text-xs text-gray-400 italic px-1">
        Disclaimer: Monthly breakdown is from trade settlement dates. Consult a CA for actual tax filing.
      </p>
    </>
  );
}

function TradesView({ report, fmt }) {
  const [expanded, setExpanded] = useState(false);
  const trades = report.trade_details || [];
  const displayTrades = expanded ? trades : trades.slice(0, 20);

  return (
    <>
      <Card className="p-0 overflow-hidden" data-testid="trades-table">
        <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-sm">Trade Details ({trades.length} trades)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">#</th>
                <th className="px-3 py-2.5 text-left font-semibold">Symbol</th>
                <th className="px-3 py-2.5 text-center font-semibold">Buy Date</th>
                <th className="px-3 py-2.5 text-right font-semibold">Buy Amt</th>
                <th className="px-3 py-2.5 text-center font-semibold">Sell Date</th>
                <th className="px-3 py-2.5 text-right font-semibold">Sell Amt</th>
                <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                <th className="px-3 py-2.5 text-right font-semibold">P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayTrades.map((t, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-800 max-w-[200px] truncate" title={t.symbol}>{t.symbol}</td>
                  <td className="px-3 py-2 text-center text-gray-600">{t.buy_date}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmt(t.buy_amount)}</td>
                  <td className="px-3 py-2 text-center text-gray-600">{t.sell_date}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmt(t.sell_amount)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{t.quantity}</td>
                  <td className={`px-3 py-2 text-right font-bold ${(t.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(t.pnl || 0) >= 0 ? '+' : ''}{fmt(t.pnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {trades.length > 20 && (
          <div className="px-4 py-3 bg-gray-50 border-t text-center">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 mx-auto"
              data-testid="toggle-trades-btn"
            >
              {expanded ? <><FaChevronUp /> Show Less</> : <><FaChevronDown /> Show All {trades.length} Trades</>}
            </button>
          </div>
        )}
      </Card>
    </>
  );
}
