import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function OptionChain() {
  const [instruments, setInstruments] = useState({});
  const [selected, setSelected] = useState('NIFTY50');
  const [chain, setChain] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [numStrikes, setNumStrikes] = useState(15);
  const [showGreeks, setShowGreeks] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const refreshRef = useRef(null);

  useEffect(() => {
    axios.get(`${API}/option-chain/instruments`).then(r => {
      if (r.data.status === 'success') setInstruments(r.data.instruments);
    }).catch(() => {});
  }, []);

  const loadChain = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/option-chain/${selected}?expiry_days=${expiryDays}&strikes=${numStrikes}`);
      if (r.data.status === 'success') setChain(r.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [selected, expiryDays, numStrikes]);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const r = await axios.get(`${API}/option-chain/oi-buildup/${selected}?expiry_days=${expiryDays}`);
      if (r.data.status === 'success') setAlerts(r.data.alerts || []);
    } catch (e) { console.error(e); }
    setAlertsLoading(false);
  }, [selected, expiryDays]);

  useEffect(() => { loadChain(); loadAlerts(); }, [loadChain, loadAlerts]);

  // Auto-refresh every 1s when enabled
  useEffect(() => {
    if (autoRefresh) {
      refreshRef.current = setInterval(() => {
        loadChain();
      }, 1000);
    }
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [autoRefresh, loadChain]);

  const fmt = (v, d = 2) => typeof v === 'number' ? v.toFixed(d) : '--';
  const fmtInt = (v) => typeof v === 'number' ? v.toLocaleString('en-IN') : '--';

  const deltaColor = (d) => {
    if (d > 0.7) return 'text-green-700 font-bold';
    if (d > 0.3) return 'text-green-600';
    if (d < -0.7) return 'text-red-700 font-bold';
    if (d < -0.3) return 'text-red-600';
    return 'text-gray-600';
  };

  const ivColor = (iv) => {
    if (iv > 30) return 'bg-red-100 text-red-800';
    if (iv > 20) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  const instrumentGroups = {
    'Index Options': Object.entries(instruments).filter(([, v]) => v.exchange !== 'MCX'),
    'MCX Commodities': Object.entries(instruments).filter(([, v]) => v.exchange === 'MCX'),
  };

  return (
    <div className="space-y-4" data-testid="option-chain-container">
      {/* Controls */}
      <Card className="p-4 bg-white border-gray-200 shadow-md">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Instrument</label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger data-testid="instrument-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(instrumentGroups).map(([group, items]) => (
                  items.length > 0 && (
                    <div key={group}>
                      <div className="px-2 py-1 text-xs font-bold text-gray-400 uppercase">{group}</div>
                      {items.map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label || `${v.name} (${v.exchange})`}</SelectItem>
                      ))}
                    </div>
                  )
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-32">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Expiry (Days)</label>
            <Select value={String(expiryDays)} onValueChange={v => setExpiryDays(Number(v))}>
              <SelectTrigger data-testid="expiry-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 5, 7, 14, 21, 30].map(d => (
                  <SelectItem key={d} value={String(d)}>{d}D</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-28">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Strikes</label>
            <Select value={String(numStrikes)} onValueChange={v => setNumStrikes(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[5, 10, 15, 20, 25].map(s => (
                  <SelectItem key={s} value={String(s)}>{s * 2 + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2 pt-4">
            <Button onClick={() => { loadChain(); loadAlerts(); }} size="sm" disabled={loading} data-testid="refresh-chain-btn"
              className="bg-blue-600 hover:bg-blue-700 text-white">
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
            <Button onClick={() => setShowGreeks(!showGreeks)} size="sm" variant="outline" data-testid="toggle-greeks-btn">
              {showGreeks ? 'Hide Greeks' : 'Show Greeks'}
            </Button>
            <div className="flex items-center gap-2 ml-2">
              <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} data-testid="auto-refresh-toggle" />
              <label className="text-xs text-gray-600 whitespace-nowrap">Auto Refresh</label>
            </div>
            {chain?.source === 'live' && <Badge className="bg-green-600 ml-2">LIVE DATA</Badge>}
            {chain?.source !== 'live' && <Badge className="bg-gray-500 ml-2">SIMULATED</Badge>}
          </div>
        </div>
      </Card>

      {/* Summary Bar */}
      {chain?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="p-3 bg-white border-gray-200 shadow-sm text-center">
            <p className="text-xs text-gray-500">Spot Price</p>
            <p className="text-lg font-bold text-gray-900" data-testid="spot-price">{fmtInt(chain.spot_price)}</p>
          </Card>
          <Card className="p-3 bg-white border-gray-200 shadow-sm text-center">
            <p className="text-xs text-gray-500">ATM Strike</p>
            <p className="text-lg font-bold text-blue-700" data-testid="atm-strike">{fmtInt(chain.atm_strike)}</p>
          </Card>
          <Card className="p-3 bg-white border-gray-200 shadow-sm text-center">
            <p className="text-xs text-gray-500">PCR</p>
            <p className={`text-lg font-bold ${chain.summary.pcr > 1 ? 'text-green-600' : 'text-red-600'}`} data-testid="pcr-value">
              {chain.summary.pcr}
            </p>
          </Card>
          <Card className="p-3 bg-white border-gray-200 shadow-sm text-center">
            <p className="text-xs text-gray-500">Max Pain</p>
            <p className="text-lg font-bold text-purple-700" data-testid="max-pain">{fmtInt(chain.summary.max_pain)}</p>
          </Card>
          <Card className="p-3 bg-white border-gray-200 shadow-sm text-center">
            <p className="text-xs text-gray-500">ATM IV</p>
            <p className="text-lg font-bold text-orange-600" data-testid="atm-iv">{chain.summary.iv_atm}%</p>
          </Card>
        </div>
      )}

      {/* OI Buildup Alerts */}
      {alerts.length > 0 && (
        <Card className="p-4 bg-white border-gray-200 shadow-md" data-testid="oi-alerts-panel">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800 text-sm">OI Buildup Alerts</h3>
            <Button onClick={loadAlerts} size="sm" variant="outline" disabled={alertsLoading} className="text-xs h-7">
              {alertsLoading ? 'Scanning...' : 'Rescan'}
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto">
            {alerts.map((a, i) => (
              <div key={i} className={`p-2.5 rounded-lg border text-xs ${
                a.severity === 'high' ? 'bg-red-50 border-red-300' : 
                a.severity === 'medium' ? 'bg-yellow-50 border-yellow-300' : 'bg-blue-50 border-blue-200'}`}
                data-testid={`oi-alert-${i}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={`text-[9px] px-1.5 py-0 ${
                    a.severity === 'high' ? 'bg-red-600' : a.severity === 'medium' ? 'bg-yellow-600' : 'bg-blue-500'}`}>
                    {a.severity?.toUpperCase()}
                  </Badge>
                  <Badge className={`text-[9px] px-1.5 py-0 ${
                    a.type?.includes('BULL') || a.type === 'SUPPORT' || a.type?.includes('PE_LONG') ? 'bg-green-600' : 
                    a.type?.includes('BEAR') || a.type === 'RESISTANCE' || a.type?.includes('CE_SHORT') ? 'bg-red-600' : 'bg-gray-500'}`}>
                    {a.type?.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <p className="text-gray-700 leading-tight">{a.message}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Option Chain Table */}
      {chain?.chain && (
        <Card className="bg-white border-gray-200 shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="option-chain-table">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th colSpan={showGreeks ? 9 : 5} className="px-2 py-2 text-center font-bold text-green-700 bg-green-50 border-r border-gray-200">
                    CALLS (CE)
                  </th>
                  <th className="px-3 py-2 text-center font-bold text-gray-800 bg-gray-100 border-r border-gray-200">
                    STRIKE
                  </th>
                  <th colSpan={showGreeks ? 9 : 5} className="px-2 py-2 text-center font-bold text-red-700 bg-red-50">
                    PUTS (PE)
                  </th>
                </tr>
                <tr className="bg-gray-50 border-b border-gray-300 text-gray-600">
                  {/* CE columns */}
                  <th className="px-2 py-1.5 text-right">OI</th>
                  <th className="px-2 py-1.5 text-right">Vol</th>
                  <th className="px-2 py-1.5 text-right">IV</th>
                  <th className="px-2 py-1.5 text-right">LTP</th>
                  <th className="px-2 py-1.5 text-right">Chg%</th>
                  {showGreeks && <>
                    <th className="px-2 py-1.5 text-right">Delta</th>
                    <th className="px-2 py-1.5 text-right">Gamma</th>
                    <th className="px-2 py-1.5 text-right">Theta</th>
                    <th className="px-2 py-1.5 text-right border-r border-gray-200">Vega</th>
                  </>}
                  {!showGreeks && <th className="px-2 py-1.5 border-r border-gray-200"></th>}
                  {/* Strike */}
                  <th className="px-3 py-1.5 text-center border-r border-gray-200 font-bold">Strike</th>
                  {/* PE columns */}
                  {!showGreeks && <th className="px-2 py-1.5"></th>}
                  {showGreeks && <>
                    <th className="px-2 py-1.5 text-right">Delta</th>
                    <th className="px-2 py-1.5 text-right">Gamma</th>
                    <th className="px-2 py-1.5 text-right">Theta</th>
                    <th className="px-2 py-1.5 text-right">Vega</th>
                  </>}
                  <th className="px-2 py-1.5 text-right">Chg%</th>
                  <th className="px-2 py-1.5 text-right">LTP</th>
                  <th className="px-2 py-1.5 text-right">IV</th>
                  <th className="px-2 py-1.5 text-right">Vol</th>
                  <th className="px-2 py-1.5 text-right">OI</th>
                </tr>
              </thead>
              <tbody>
                {chain.chain.map((row, idx) => (
                  <tr key={row.strike}
                    className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors
                      ${row.is_atm ? 'bg-yellow-50 border-yellow-300 border-y-2' : ''}
                      ${row.is_itm_ce ? 'bg-green-50/30' : ''}`}
                    data-testid={`chain-row-${row.strike}`}
                  >
                    {/* CE Side */}
                    <td className="px-2 py-1.5 text-right text-gray-700">{fmtInt(row.ce.oi)}</td>
                    <td className="px-2 py-1.5 text-right text-gray-600">{fmtInt(row.ce.volume)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${ivColor(row.ce.iv)}`}>{fmt(row.ce.iv, 1)}%</span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold text-gray-900">{fmt(row.ce.ltp)}</td>
                    <td className={`px-2 py-1.5 text-right font-medium ${row.ce.change_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {row.ce.change_pct >= 0 ? '+' : ''}{fmt(row.ce.change_pct, 1)}%
                    </td>
                    {showGreeks && <>
                      <td className={`px-2 py-1.5 text-right ${deltaColor(row.ce.delta)}`}>{fmt(row.ce.delta, 3)}</td>
                      <td className="px-2 py-1.5 text-right text-gray-500">{fmt(row.ce.gamma, 4)}</td>
                      <td className="px-2 py-1.5 text-right text-red-500">{fmt(row.ce.theta)}</td>
                      <td className="px-2 py-1.5 text-right text-blue-500 border-r border-gray-200">{fmt(row.ce.vega)}</td>
                    </>}
                    {!showGreeks && <td className="border-r border-gray-200"></td>}

                    {/* Strike */}
                    <td className={`px-3 py-1.5 text-center font-bold border-r border-gray-200
                      ${row.is_atm ? 'text-orange-700 bg-yellow-100' : 'text-gray-800'}`}>
                      {fmtInt(row.strike)}
                      {row.is_atm && <Badge className="ml-1 bg-orange-500 text-[9px] px-1 py-0">ATM</Badge>}
                    </td>

                    {/* PE Side */}
                    {!showGreeks && <td className=""></td>}
                    {showGreeks && <>
                      <td className={`px-2 py-1.5 text-right ${deltaColor(row.pe.delta)}`}>{fmt(row.pe.delta, 3)}</td>
                      <td className="px-2 py-1.5 text-right text-gray-500">{fmt(row.pe.gamma, 4)}</td>
                      <td className="px-2 py-1.5 text-right text-red-500">{fmt(row.pe.theta)}</td>
                      <td className="px-2 py-1.5 text-right text-blue-500">{fmt(row.pe.vega)}</td>
                    </>}
                    <td className={`px-2 py-1.5 text-right font-medium ${row.pe.change_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {row.pe.change_pct >= 0 ? '+' : ''}{fmt(row.pe.change_pct, 1)}%
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold text-gray-900">{fmt(row.pe.ltp)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${ivColor(row.pe.iv)}`}>{fmt(row.pe.iv, 1)}%</span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-600">{fmtInt(row.pe.volume)}</td>
                    <td className="px-2 py-1.5 text-right text-gray-700">{fmtInt(row.pe.oi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500 px-2">
        <span><span className="inline-block w-3 h-3 bg-yellow-100 border border-yellow-300 rounded mr-1"></span>ATM Strike</span>
        <span><span className="inline-block w-3 h-3 bg-green-50 border border-green-200 rounded mr-1"></span>ITM Calls</span>
        <span>PCR &gt; 1 = Bullish | PCR &lt; 1 = Bearish</span>
        <span>Max Pain = Strike where option writers lose least</span>
      </div>
    </div>
  );
}
