import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import axios from 'axios';
import { FaFileExcel, FaFilePdf, FaCalendarAlt, FaChartBar } from 'react-icons/fa';

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
  const [exporting, setExporting] = useState('');
  const [viewMode, setViewMode] = useState('summary'); // summary | monthly

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const [taxRes, statusRes] = await Promise.all([
        axios.get(`${API}/tax/report?fy_year=${fyYear}`),
        axios.get(`${API}/combined-status`).catch(() => ({ data: {} })),
      ]);
      if (taxRes.data?.status === 'success') {
        const rep = taxRes.data.report;
        // Override with broker P&L when available (more accurate for LIVE trades)
        if (statusRes.data?.portfolio?.total_pnl != null) {
          rep.broker_pnl = statusRes.data.portfolio.total_pnl;
          rep.net_pnl = statusRes.data.portfolio.total_pnl;
          rep.tax_liability = Math.max(0, Math.round(statusRes.data.portfolio.total_pnl * 0.156 * 100) / 100);
        }
        setReport(rep);
      }
    } catch (e) {
      console.error('Tax report error:', e);
    } finally {
      setLoading(false);
    }
  }, [fyYear]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const downloadExcel = async () => {
    setExporting('excel');
    try {
      const res = await axios.get(`${API}/tax/export-excel?fy_year=${fyYear}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tax_Report_FY_${fyYear}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Excel export failed: ' + e.message);
    } finally {
      setExporting('');
    }
  };

  const downloadPDF = async () => {
    setExporting('pdf');
    try {
      const res = await axios.get(`${API}/tax/export-pdf?fy_year=${fyYear}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tax_Report_FY_${fyYear}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('PDF export failed: ' + e.message);
    } finally {
      setExporting('');
    }
  };

  const fmt = (v) => formatCurrency ? formatCurrency(v) : `${Math.round(v || 0).toLocaleString('en-IN')}`;

  if (loading && !report) {
    return <Card className="p-8 text-center" data-testid="tax-loading"><p className="text-gray-500">Loading tax report...</p></Card>;
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
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={downloadExcel} disabled={!!exporting} variant="outline" size="sm" className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50" data-testid="export-excel-btn">
              <FaFileExcel /> {exporting === 'excel' ? 'Exporting...' : 'Excel'}
            </Button>
            <Button onClick={downloadPDF} disabled={!!exporting} variant="outline" size="sm" className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50" data-testid="export-pdf-btn">
              <FaFilePdf /> {exporting === 'pdf' ? 'Exporting...' : 'PDF'}
            </Button>
          </div>
        </div>
      </Card>

      {!report || report.total_trades === 0 ? (
        <Card className="p-8 text-center" data-testid="no-tax-data">
          <FaChartBar className="mx-auto text-4xl text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No closed trades in FY {fyYear}</p>
          <p className="text-gray-400 text-sm mt-1">Tax report will be generated once trades are closed</p>
        </Card>
      ) : viewMode === 'summary' ? (
        <>
          {/* Tax Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="tax-summary-cards">
            <Card className="p-4 border-l-4 border-l-blue-500">
              <p className="text-xs text-gray-500 font-medium">Total Trades</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{report.total_trades}</p>
              <p className="text-xs text-gray-400">Win Rate: {report.win_rate}%</p>
            </Card>
            <Card className={`p-4 border-l-4 ${report.net_pnl >= 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
              <p className="text-xs text-gray-500 font-medium">Net P&L</p>
              <p className={`text-xl font-bold mt-1 ${report.net_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{report.net_pnl >= 0 ? '+' : ''}{fmt(report.net_pnl)}</p>
              <p className="text-xs text-gray-400">Profit: {fmt(report.total_profit)} | Loss: {fmt(report.total_loss)}</p>
            </Card>
            <Card className="p-4 border-l-4 border-l-orange-500">
              <p className="text-xs text-gray-500 font-medium">Tax Liability</p>
              <p className="text-xl font-bold text-orange-600 mt-1">{fmt(report.total_tax_liability)}</p>
              <p className="text-xs text-gray-400">Effective: {report.effective_tax_rate}%</p>
            </Card>
            <Card className="p-4 border-l-4 border-l-purple-500">
              <p className="text-xs text-gray-500 font-medium">F&O Turnover</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{fmt(report.turnover)}</p>
              {report.audit_required && <Badge className="bg-red-100 text-red-700 text-xs mt-1">Audit Required</Badge>}
              {!report.audit_required && <p className="text-xs text-green-600 mt-1">No audit needed</p>}
            </Card>
          </div>

          {/* Detailed Tax Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5" data-testid="tax-calculation-card">
              <h3 className="font-bold text-gray-800 mb-4 text-base">Tax Calculation</h3>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Net Taxable Profit</span>
                  <span className={`text-sm font-bold ${report.net_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{report.net_pnl >= 0 ? '+' : ''}{fmt(report.net_pnl)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">STCG Tax @15%</span>
                  <span className="text-sm font-semibold text-gray-800">{fmt(report.stcg_tax)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Health & Education Cess @4%</span>
                  <span className="text-sm font-semibold text-gray-800">{fmt(report.cess)}</span>
                </div>
                <div className="flex justify-between py-2 bg-orange-50 rounded px-2 -mx-2">
                  <span className="text-sm font-bold text-gray-800">Total Tax Liability</span>
                  <span className="text-base font-bold text-orange-600">{fmt(report.total_tax_liability)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">STT Paid (Approx)</span>
                  <span className="text-sm text-gray-800">{fmt(report.stt_paid)}</span>
                </div>
              </div>
            </Card>

            <Card className="p-5" data-testid="tax-trading-summary-card">
              <h3 className="font-bold text-gray-800 mb-4 text-base">Trading Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Total Buy Value</span>
                  <span className="text-sm font-semibold">{fmt(report.total_buy_value)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Total Sell Value</span>
                  <span className="text-sm font-semibold">{fmt(report.total_sell_value)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Total Profit</span>
                  <span className="text-sm font-bold text-green-600">+{fmt(report.total_profit)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Total Loss</span>
                  <span className="text-sm font-bold text-red-600">-{fmt(report.total_loss)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">F&O Turnover</span>
                  <span className="text-sm font-semibold">{fmt(report.turnover)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-600">Audit Threshold</span>
                  <span className="text-sm text-gray-500">{fmt(report.audit_limit)}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-gray-400 italic px-1" data-testid="tax-disclaimer">
            Disclaimer: This report is auto-generated for informational purposes. Consult a CA for actual tax filing. F&O income is non-speculative business income. ITR-3 applicable.
          </p>
        </>
      ) : (
        /* Monthly View */
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
                    <th className="px-4 py-3 text-right font-semibold">STCG Tax</th>
                    <th className="px-4 py-3 text-right font-semibold">Cess</th>
                    <th className="px-4 py-3 text-right font-semibold">Total Tax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(report.monthly_breakdown || {}).map(([month, d]) => (
                    <tr key={month} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{month}</td>
                      <td className="px-4 py-3 text-center text-gray-700">{d.trades}</td>
                      <td className="px-4 py-3 text-right text-green-600 font-semibold">+{fmt(d.profit)}</td>
                      <td className="px-4 py-3 text-right text-red-600 font-semibold">-{fmt(d.loss)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${d.net_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{d.net_pnl >= 0 ? '+' : ''}{fmt(d.net_pnl)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(d.turnover)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(d.stcg_tax)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(d.cess)}</td>
                      <td className="px-4 py-3 text-right font-bold text-orange-600">{fmt(d.total_tax)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100">
                  <tr className="font-bold">
                    <td className="px-4 py-3 text-gray-800">TOTAL</td>
                    <td className="px-4 py-3 text-center text-gray-800">{report.total_trades}</td>
                    <td className="px-4 py-3 text-right text-green-600">+{fmt(report.total_profit)}</td>
                    <td className="px-4 py-3 text-right text-red-600">-{fmt(report.total_loss)}</td>
                    <td className={`px-4 py-3 text-right ${report.net_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{report.net_pnl >= 0 ? '+' : ''}{fmt(report.net_pnl)}</td>
                    <td className="px-4 py-3 text-right text-gray-800">{fmt(report.turnover)}</td>
                    <td className="px-4 py-3 text-right text-gray-800">{fmt(report.stcg_tax)}</td>
                    <td className="px-4 py-3 text-right text-gray-800">{fmt(report.cess)}</td>
                    <td className="px-4 py-3 text-right text-orange-600">{fmt(report.total_tax_liability)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <p className="text-xs text-gray-400 italic px-1">
            Disclaimer: This report is auto-generated. Consult a CA for actual tax filing. F&O income is non-speculative business income. ITR-3 applicable.
          </p>
        </>
      )}
    </div>
  );
}
