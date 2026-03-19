import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const BACKEND_URL = (() => {
  const envUrl = process.env.REACT_APP_BACKEND_URL || '';
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) return '';
  return envUrl;
})();
const API = `${BACKEND_URL}/api`;

export default function TradeAnalytics() {
  const [trades, setTrades] = useState([]);
  const [filter, setFilter] = useState('all');
  const [brokerPnl, setBrokerPnl] = useState(null);

  useEffect(() => {
    axios.get(`${API}/trades/history?limit=200`).then(r => setTrades(r.data?.trades || [])).catch(() => {});
    // Fetch actual P&L from broker for LIVE mode
    axios.get(`${API}/combined-status`).then(r => {
      if (r.data?.status === 'success' && r.data.total_pnl != null) {
        setBrokerPnl(r.data.total_pnl);
      }
    }).catch(() => {});
  }, []);

  const closedTrades = useMemo(() => trades.filter(t => t.status === 'CLOSED'), [trades]);
  const openTrades = useMemo(() => trades.filter(t => t.status === 'OPEN'), [trades]);

  const filteredTrades = useMemo(() => {
    if (filter === 'open') return openTrades;
    if (filter === 'closed') return closedTrades;
    if (filter === 'winning') return closedTrades.filter(t => t.pnl > 0);
    if (filter === 'losing') return closedTrades.filter(t => t.pnl <= 0);
    return trades;
  }, [trades, filter, openTrades, closedTrades]);

  // Daily P&L data
  const dailyPnL = useMemo(() => {
    const byDate = {};
    closedTrades.forEach(t => {
      const date = (t.exit_time || t.entry_time || '').split('T')[0];
      if (date) byDate[date] = (byDate[date] || 0) + (t.pnl || 0);
    });
    const sorted = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0]));
    let cumulative = 0;
    return sorted.map(([date, pnl]) => { cumulative += pnl; return { date, pnl: Math.round(pnl), cumulative: Math.round(cumulative) }; });
  }, [closedTrades]);

  // Win/Loss stats - use broker P&L for total when available (more accurate for LIVE trades)
  const stats = useMemo(() => {
    const wins = closedTrades.filter(t => t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl <= 0 && t.pnl !== 0);
    const zeroOrNull = closedTrades.filter(t => !t.pnl || t.pnl === 0);
    const storedPnl = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    // Use broker P&L as source of truth when available
    const totalPnl = brokerPnl != null ? brokerPnl : storedPnl;
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
    return { wins: wins.length, losses: losses.length, totalPnl, avgWin, avgLoss, total: closedTrades.length, winRate: closedTrades.length ? (wins.length / closedTrades.length * 100) : 0, isFromBroker: brokerPnl != null };
  }, [closedTrades, brokerPnl]);

  // Trade type distribution
  const typeDist = useMemo(() => {
    const calls = trades.filter(t => t.trade_type === 'CALL').length;
    const puts = trades.filter(t => t.trade_type === 'PUT').length;
    return { calls, puts };
  }, [trades]);

  const pnlChartData = {
    labels: dailyPnL.map(d => d.date.slice(5)),
    datasets: [
      { label: 'Cumulative P&L', data: dailyPnL.map(d => d.cumulative), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3, pointRadius: 3 },
      { label: 'Daily P&L', data: dailyPnL.map(d => d.pnl), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: false, tension: 0.3, pointRadius: 3 },
    ],
  };

  const winLossData = {
    labels: ['Winning', 'Losing'],
    datasets: [{ data: [stats.wins, stats.losses], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0, hoverOffset: 8 }],
  };

  const typeData = {
    labels: ['CALL', 'PUT'],
    datasets: [{ data: [typeDist.calls, typeDist.puts], backgroundColor: ['#3b82f6', '#f59e0b'], borderWidth: 0, hoverOffset: 8 }],
  };

  const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } };

  if (trades.length === 0) {
    return (
      <Card className="p-8 text-center" data-testid="trade-analytics-empty">
        <p className="text-gray-500 text-lg font-medium">No trades yet</p>
        <p className="text-gray-400 text-sm mt-1">Trades will appear here after news analysis generates signals</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="trade-analytics">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Trades', value: stats.total, color: 'text-gray-800' },
          { label: 'Win Rate', value: `${stats.winRate.toFixed(1)}%`, color: stats.winRate >= 50 ? 'text-green-600' : 'text-red-600' },
          { label: 'Total P&L', value: `${stats.totalPnl >= 0 ? '+' : ''}${Math.round(stats.totalPnl).toLocaleString()}`, color: stats.totalPnl >= 0 ? 'text-green-600' : 'text-red-600' },
          { label: 'Avg Win', value: `+${Math.round(stats.avgWin).toLocaleString()}`, color: 'text-green-600' },
          { label: 'Avg Loss', value: `${Math.round(stats.avgLoss).toLocaleString()}`, color: 'text-red-600' },
          { label: 'Open', value: openTrades.length, color: 'text-blue-600' },
        ].map((s, i) => (
          <Card key={i} className="p-3 text-center">
            <p className="text-xs text-gray-500 font-medium">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <h3 className="font-bold text-gray-800 text-sm mb-3">P&L Performance</h3>
          <div style={{ height: 220 }}>{dailyPnL.length > 0 ? <Line data={pnlChartData} options={chartOptions} /> : <p className="text-gray-400 text-sm text-center pt-16">No closed trades yet</p>}</div>
        </Card>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
          <Card className="p-4">
            <h3 className="font-bold text-gray-800 text-sm mb-2">Win / Loss</h3>
            <div style={{ height: 120 }}><Doughnut data={winLossData} options={{ ...chartOptions, cutout: '60%' }} /></div>
          </Card>
          <Card className="p-4">
            <h3 className="font-bold text-gray-800 text-sm mb-2">CALL / PUT</h3>
            <div style={{ height: 120 }}><Doughnut data={typeData} options={{ ...chartOptions, cutout: '60%' }} /></div>
          </Card>
        </div>
      </div>

      {/* Trade History */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-800 text-sm">Trade History</h3>
          <div className="flex gap-1">
            {['all', 'open', 'closed', 'winning', 'losing'].map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} data-testid={`filter-${f}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['Type', 'Symbol', 'Entry', 'Exit', 'Qty', 'Investment', 'P&L', 'P&L %', 'Status', 'Time'].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTrades.map((t, i) => (
                <tr key={t.id || i} className="hover:bg-gray-50">
                  <td className="px-2 py-2"><Badge className={t.trade_type === 'CALL' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}>{t.trade_type}</Badge></td>
                  <td className="px-2 py-2 font-medium">{t.symbol}</td>
                  <td className="px-2 py-2">{t.entry_price}</td>
                  <td className="px-2 py-2">{t.exit_price || '-'}</td>
                  <td className="px-2 py-2">{t.quantity}</td>
                  <td className="px-2 py-2">{Math.round(t.investment || 0).toLocaleString()}</td>
                  <td className={`px-2 py-2 font-bold ${(t.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{t.pnl ? `${t.pnl >= 0 ? '+' : ''}${Math.round(t.pnl).toLocaleString()}` : '-'}</td>
                  <td className={`px-2 py-2 ${(t.pnl_percentage || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{t.pnl_percentage ? `${t.pnl_percentage >= 0 ? '+' : ''}${t.pnl_percentage.toFixed(1)}%` : '-'}</td>
                  <td className="px-2 py-2"><Badge className={t.status === 'OPEN' ? 'bg-blue-100 text-blue-700' : t.status === 'CLOSED' ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-700'}>{t.status}</Badge></td>
                  <td className="px-2 py-2 text-gray-400">{(t.entry_time || '').slice(11, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
