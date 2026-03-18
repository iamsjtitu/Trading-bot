import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import axios from 'axios';
import { FaDownload, FaFilter, FaSortAmountDown, FaSortAmountUp } from 'react-icons/fa';

const BACKEND_URL = (() => {
  const envUrl = process.env.REACT_APP_BACKEND_URL || '';
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) return '';
  return envUrl;
})();
const API = `${BACKEND_URL}/api`;

export default function TradeHistory({ formatCurrency, tradingMode, brokerConnected, brokerOrders }) {
  const [trades, setTrades] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const isLive = tradingMode === 'LIVE' && brokerConnected;

  // Filters
  const [tradeType, setTradeType] = useState('all');
  const [status, setStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('entry_time');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFilters, setShowFilters] = useState(false);

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '500', sort_by: sortBy, sort_order: sortOrder });
      if (tradeType !== 'all') params.set('trade_type', tradeType);
      if (status !== 'all') params.set('status', status);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const res = await axios.get(`${API}/trades/history?${params}`);
      setTrades(res.data?.trades || []);
      setSummary(res.data?.summary || null);
    } catch (e) {
      console.error('Fetch trades error:', e);
    } finally {
      setLoading(false);
    }
  }, [tradeType, status, dateFrom, dateTo, sortBy, sortOrder]);

  useEffect(() => { fetchTrades(); }, [fetchTrades]);

  const toggleSort = (field) => {
    if (sortBy === field) setSortOrder(o => o === 'desc' ? 'asc' : 'desc');
    else { setSortBy(field); setSortOrder('desc'); }
  };

  const SortIcon = ({ field }) => {
    if (sortBy !== field) return null;
    return sortOrder === 'desc' ? <FaSortAmountDown className="inline ml-1 text-xs" /> : <FaSortAmountUp className="inline ml-1 text-xs" />;
  };

  const exportCSV = () => {
    if (!trades.length) return;
    const headers = ['Type', 'Symbol', 'Entry Price', 'Exit Price', 'Qty', 'Investment', 'P&L', 'P&L %', 'Status', 'Entry Time', 'Exit Time', 'Exit Reason'];
    const rows = trades.map(t => [
      t.trade_type, t.symbol, t.entry_price, t.exit_price || '', t.quantity, t.investment,
      t.pnl || 0, t.pnl_percentage ? t.pnl_percentage.toFixed(1) : '', t.status,
      t.entry_time || '', t.exit_time || '', t.exit_reason || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `trade_history_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportCSVLive = () => {
    const orders = brokerOrders || [];
    if (!orders.length) return;
    const headers = ['Order ID', 'Symbol', 'Type', 'Qty', 'Price', 'Avg Price', 'Status', 'Product', 'Time'];
    const rows = orders.map(o => [
      o.order_id, o.symbol, o.transaction_type, o.quantity, o.price, o.average_price,
      o.status, o.product, o.placed_at || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `upstox_orders_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const fmt = (v) => formatCurrency ? formatCurrency(v) : `${Math.round(v).toLocaleString('en-IN')}`;

  if (loading && trades.length === 0 && !isLive) {
    return <Card className="p-8 text-center" data-testid="trade-history-loading"><p className="text-gray-500">Loading trades...</p></Card>;
  }

  // In LIVE mode, show Upstox orders
  if (isLive) {
    const liveOrders = brokerOrders || [];
    const completed = liveOrders.filter(o => o.status === 'complete' || o.status === 'traded');
    return (
      <div className="space-y-4" data-testid="trade-history-page">
        <div className="flex items-center gap-2 mb-2">
          <Badge className="bg-green-600 text-white">LIVE MODE</Badge>
          <span className="text-sm text-gray-600">Showing orders from Upstox</span>
        </div>
        {/* Live Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="trade-history-summary">
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-500 font-medium">Total Orders</p>
            <p className="text-lg font-bold text-gray-800">{liveOrders.length}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-500 font-medium">Completed</p>
            <p className="text-lg font-bold text-green-600">{completed.length}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-500 font-medium">Pending</p>
            <p className="text-lg font-bold text-yellow-600">{liveOrders.filter(o => o.status === 'open' || o.status === 'pending').length}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-500 font-medium">Rejected</p>
            <p className="text-lg font-bold text-red-600">{liveOrders.filter(o => o.status === 'rejected' || o.status === 'cancelled').length}</p>
          </Card>
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Upstox Orders ({liveOrders.length})</span>
            <Button onClick={exportCSVLive} variant="outline" size="sm" className="gap-1" data-testid="export-csv-btn">
              <FaDownload className="text-xs" /> Export CSV
            </Button>
          </div>
        </Card>

        <Card className="p-0 overflow-hidden">
          {liveOrders.length === 0 ? (
            <div className="p-8 text-center" data-testid="no-trades-message">
              <p className="text-gray-500 font-medium">No orders today</p>
              <p className="text-gray-400 text-sm mt-1">Orders placed via Upstox will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs" data-testid="trades-table">
                <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Order ID</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Symbol</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600">Type</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Qty</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Price</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Avg Price</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600">Status</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {liveOrders.map((o, i) => (
                    <tr key={o.order_id || i} className="hover:bg-gray-50" data-testid={`trade-row-${i}`}>
                      <td className="px-3 py-2 font-mono text-gray-600">{(o.order_id || '').slice(-8)}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{o.symbol}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge className={o.transaction_type === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{o.transaction_type}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{o.quantity}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{o.price || '-'}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{o.average_price || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge className={
                          o.status === 'complete' || o.status === 'traded' ? 'bg-green-100 text-green-700' :
                          o.status === 'rejected' || o.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }>{o.status?.toUpperCase()}</Badge>
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{o.placed_at ? new Date(o.placed_at).toLocaleTimeString('en-IN') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="trade-history-page">
      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3" data-testid="trade-history-summary">
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-500 font-medium">Total Trades</p>
            <p className="text-lg font-bold text-gray-800">{summary.total_trades}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-500 font-medium">Win Rate</p>
            <p className={`text-lg font-bold ${summary.win_rate >= 50 ? 'text-green-600' : 'text-red-600'}`}>{summary.win_rate?.toFixed(1)}%</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-500 font-medium">Total P&L</p>
            <p className={`text-lg font-bold ${summary.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{summary.total_pnl >= 0 ? '+' : ''}{fmt(summary.total_pnl)}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-500 font-medium">Avg Win</p>
            <p className="text-lg font-bold text-green-600">+{fmt(summary.avg_win)}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-500 font-medium">Best Trade</p>
            <p className="text-lg font-bold text-green-600">+{fmt(summary.best_trade)}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-500 font-medium">Worst Trade</p>
            <p className="text-lg font-bold text-red-600">{fmt(summary.worst_trade)}</p>
          </Card>
        </div>
      )}

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowFilters(!showFilters)} variant="outline" size="sm" className="gap-1" data-testid="toggle-filters-btn">
              <FaFilter className="text-xs" /> Filters {showFilters ? '(Hide)' : ''}
            </Button>
            <div className="flex gap-1">
              {['all', 'OPEN', 'CLOSED'].map(s => (
                <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${status === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} data-testid={`status-filter-${s.toLowerCase()}`}>
                  {s === 'all' ? 'All' : s}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {['all', 'CALL', 'PUT'].map(t => (
                <button key={t} onClick={() => setTradeType(t)} className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${tradeType === t ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} data-testid={`type-filter-${t.toLowerCase()}`}>
                  {t === 'all' ? 'All Types' : t}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={exportCSV} variant="outline" size="sm" className="gap-1" data-testid="export-csv-btn">
            <FaDownload className="text-xs" /> Export CSV
          </Button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-gray-200" data-testid="advanced-filters">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" data-testid="date-from-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" data-testid="date-to-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sort By</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" data-testid="sort-by-select">
                <option value="entry_time">Date</option>
                <option value="pnl">P&L</option>
                <option value="investment">Investment</option>
                <option value="pnl_percentage">P&L %</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={() => { setDateFrom(''); setDateTo(''); setTradeType('all'); setStatus('all'); setSortBy('entry_time'); setSortOrder('desc'); }} variant="outline" size="sm" data-testid="clear-filters-btn">
                Clear All
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Trade Table */}
      <Card className="p-0 overflow-hidden">
        {trades.length === 0 ? (
          <div className="p-8 text-center" data-testid="no-trades-message">
            <p className="text-gray-500 font-medium">No trades found</p>
            <p className="text-gray-400 text-sm mt-1">Trades will appear here after news analysis generates signals</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs" data-testid="trades-table">
              <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Type</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Symbol</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-600 cursor-pointer hover:text-blue-600" onClick={() => toggleSort('entry_time')} data-testid="sort-date">
                    Entry <SortIcon field="entry_time" />
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Exit</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Qty</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-600 cursor-pointer hover:text-blue-600" onClick={() => toggleSort('investment')} data-testid="sort-investment">
                    Investment <SortIcon field="investment" />
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-600 cursor-pointer hover:text-blue-600" onClick={() => toggleSort('pnl')} data-testid="sort-pnl">
                    P&L <SortIcon field="pnl" />
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-600 cursor-pointer hover:text-blue-600" onClick={() => toggleSort('pnl_percentage')} data-testid="sort-pnl-pct">
                    P&L % <SortIcon field="pnl_percentage" />
                  </th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600">Status</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {trades.map((t, i) => (
                  <tr key={t.id || i} className="hover:bg-gray-50" data-testid={`trade-row-${i}`}>
                    <td className="px-3 py-2">
                      <Badge className={t.trade_type === 'CALL' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}>{t.trade_type}</Badge>
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">{t.symbol}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{t.entry_price}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{t.exit_price ? t.exit_price.toFixed(2) : '-'}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{t.quantity}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{Math.round(t.investment || 0).toLocaleString()}</td>
                    <td className={`px-3 py-2 text-right font-bold ${(t.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {t.pnl ? `${t.pnl >= 0 ? '+' : ''}${Math.round(t.pnl).toLocaleString()}` : '-'}
                    </td>
                    <td className={`px-3 py-2 text-right ${(t.pnl_percentage || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {t.pnl_percentage ? `${t.pnl_percentage >= 0 ? '+' : ''}${t.pnl_percentage.toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge className={t.status === 'OPEN' ? 'bg-blue-100 text-blue-700' : t.status === 'CLOSED' ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-700'}>{t.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {t.exit_reason === 'TARGET_HIT' ? <span className="text-green-600">Target</span> : t.exit_reason === 'STOPLOSS_HIT' ? <span className="text-red-600">Stoploss</span> : (t.entry_time || '').slice(11, 19)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Results count */}
      {trades.length > 0 && (
        <p className="text-xs text-gray-400 text-right" data-testid="results-count">
          Showing {trades.length} trade(s) {tradeType !== 'all' || status !== 'all' || dateFrom || dateTo ? '(filtered)' : ''}
        </p>
      )}
    </div>
  );
}
