import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import axios from 'axios';
import { FaShieldAlt, FaSync, FaClock, FaChartLine, FaLayerGroup, FaNewspaper, FaArrowUp, FaExclamationTriangle } from 'react-icons/fa';

const BACKEND_URL = (() => {
  const envUrl = process.env.REACT_APP_BACKEND_URL || '';
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) return '';
  return envUrl;
})();
const API = `${BACKEND_URL}/api`;

const GUARD_INFO = {
  multi_timeframe: { label: 'Multi-Timeframe Confirmation', icon: FaLayerGroup, desc: 'Signal tab hi trade hoga jab 2+ timeframes (5min + 30min) same direction confirm karein.' },
  market_regime_filter: { label: 'Market Regime Filter', icon: FaChartLine, desc: 'Sideways/Choppy market mein auto trading pause. Options premium decay se loss bacha.' },
  trailing_stop: { label: 'Trailing Stop Loss', icon: FaArrowUp, desc: 'Jaise price upar jaye, SL bhi upar move kare. Winning trades ka profit lock hota hai.' },
  multi_source_verification: { label: 'Multi-Source News Verification', icon: FaNewspaper, desc: 'Trade tab ho jab 2+ alag news sources same direction dikha rahe ho 15 min mein.' },
  time_of_day_filter: { label: 'Time-of-Day Filter', icon: FaClock, desc: 'Market open (9:15-9:45) aur close (3:00-3:30) pe high volatility window mein trading pause.' },
  max_daily_loss: { label: 'Max Daily Loss Auto-Stop', icon: FaExclamationTriangle, desc: 'Agar din ka total loss limit cross kare toh baaki din trading band.' },
  max_daily_profit: { label: 'Max Daily Profit Auto-Stop', icon: FaArrowUp, desc: 'Agar din ka target profit achieve ho jaaye toh baaki din koi trade nahi. Profit lock!' },
  kelly_sizing: { label: 'Smart Position Sizing (Kelly)', icon: FaChartLine, desc: 'AI decide kare kitna invest karna hai - win rate, streak, drawdown sab dekhke. Losing streak mein size reduce.' },
  greeks_filter: { label: 'Options Greeks & IV Filter', icon: FaLayerGroup, desc: 'Delta, Theta, IV check karke bekar options avoid. High theta decay ya expensive IV wale options block.' },
};

export default function AIGuards() {
  const [guards, setGuards] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/ai-guards/status`, { timeout: 10000 });
      if (res.data?.status === 'success') {
        setGuards(res.data.guards);
        setCurrentTime(res.data.current_time);
      }
    } catch (e) { console.error('AI Guards fetch error:', e); }
  }, []);

  useEffect(() => { fetchStatus(); const i = setInterval(fetchStatus, 30000); return () => clearInterval(i); }, [fetchStatus]);

  const toggleGuard = async (key, enabled) => {
    try {
      setLoading(true);
      await axios.post(`${API}/ai-guards/update`, { [key]: enabled });
      await fetchStatus();
    } catch (e) { console.error('Toggle error:', e); }
    finally { setLoading(false); }
  };

  if (!guards) return null;

  // Count active & blocking guards for summary badge
  const guardEntries = Object.entries(GUARD_INFO);
  const activeCount = guardEntries.filter(([key]) => guards[key]?.enabled !== false).length;
  const blockingCount = guardEntries.filter(([key]) => guards[key]?.blocked).length;

  return (
    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 p-4 shadow-lg" data-testid="ai-guards-panel">
      {/* Collapsible Header */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid="ai-guards-toggle"
      >
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <FaShieldAlt className="text-blue-600" />
          AI Loss Prevention Guards
          <Badge className="bg-blue-600 text-xs">
            {activeCount}/{guardEntries.length} Active
          </Badge>
          {blockingCount > 0 && (
            <Badge className="bg-red-600 text-xs">{blockingCount} Blocking</Badge>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{currentTime}</span>
          <button
            onClick={(e) => { e.stopPropagation(); fetchStatus(); }}
            className="text-gray-400 hover:text-blue-600 transition"
            data-testid="refresh-guards-btn"
          >
            <FaSync className="text-sm" />
          </button>
          <Button variant="ghost" className="text-gray-600" data-testid="ai-guards-expand-btn">
            {isExpanded ? '\u25B2 Hide' : '\u25BC Show'}
          </Button>
        </div>
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="mt-4 space-y-3 animate-slide-in" data-testid="ai-guards-list">
          {guardEntries.map(([key, info]) => {
            const guard = guards[key] || {};
            const Icon = info.icon;
            const isBlocked = guard.blocked;
            const isEnabled = guard.enabled !== false;
            const canToggle = true; // All guards can be toggled including max_daily_loss

            return (
              <div key={key} className={`p-3 rounded-lg border transition ${isBlocked ? 'border-red-300 bg-red-50' : isEnabled ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-gray-50'}`} data-testid={`guard-${key}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <Icon className={`text-sm flex-shrink-0 ${isBlocked ? 'text-red-500' : isEnabled ? 'text-green-600' : 'text-gray-400'}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{info.label}</span>
                        {isBlocked && <Badge className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0">BLOCKING</Badge>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-tight">{info.desc}</p>
                      {key === 'market_regime_filter' && guard.current_regime && (
                        <p className="text-xs mt-1 font-medium text-gray-600">Current: {guard.current_regime} ({guard.confidence}%)</p>
                      )}
                      {key === 'time_of_day_filter' && guard.current_window && (
                        <p className={`text-xs mt-1 font-medium ${guard.current_window.includes('BLOCKED') ? 'text-red-600' : 'text-green-600'}`}>{guard.current_window}</p>
                      )}
                      {key === 'max_daily_loss' && (
                        <div className="mt-1.5 space-y-1.5">
                          <p className={`text-xs font-medium ${guard.blocked ? 'text-red-600' : 'text-gray-600'}`}>
                            Today's Loss: &#8377;{guard.today_loss?.toLocaleString('en-IN')} / &#8377;{guard.limit?.toLocaleString('en-IN')}
                          </p>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 whitespace-nowrap">Limit &#8377;</label>
                            <input
                              type="number"
                              defaultValue={guard.limit || 5000}
                              min="500"
                              step="500"
                              className="w-24 px-2 py-1 text-xs border border-gray-300 rounded"
                              data-testid="max-daily-loss-input"
                              onBlur={async (e) => {
                                const val = parseInt(e.target.value) || 5000;
                                try {
                                  await axios.post(`${API}/settings/update`, { auto_trading: { max_daily_loss: val }, risk: { max_daily_loss: val } });
                                  fetchStatus();
                                } catch (_) {}
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                            />
                            <span className="text-[10px] text-gray-400">min ₹500</span>
                          </div>
                        </div>
                      )}
                      {key === 'max_daily_profit' && (
                        <div className="mt-1.5 space-y-1.5">
                          <p className={`text-xs font-medium ${guard.blocked ? 'text-green-600' : 'text-gray-600'}`}>
                            Today's Profit: &#8377;{guard.today_profit?.toLocaleString('en-IN')} / &#8377;{guard.target?.toLocaleString('en-IN')}
                            {guard.blocked && <span className="ml-1 text-green-700 font-bold">TARGET HIT!</span>}
                          </p>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 whitespace-nowrap">Target &#8377;</label>
                            <input
                              type="number"
                              defaultValue={guard.target || 10000}
                              min="500"
                              step="500"
                              className="w-24 px-2 py-1 text-xs border border-gray-300 rounded"
                              data-testid="max-daily-profit-input"
                              onBlur={async (e) => {
                                const val = parseInt(e.target.value) || 10000;
                                try {
                                  await axios.post(`${API}/settings/update`, { auto_trading: { max_daily_profit: val }, risk: { max_daily_profit: val } });
                                  fetchStatus();
                                } catch (_) {}
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                            />
                            <span className="text-[10px] text-gray-400">min ₹500</span>
                          </div>
                        </div>
                      )}
                      {key === 'multi_source_verification' && guard.recent_sources && Object.keys(guard.recent_sources).length > 0 && (
                        <p className="text-xs mt-1 text-gray-600">Recent: {Object.entries(guard.recent_sources).map(([dir, count]) => `${dir}: ${count} sources`).join(', ')}</p>
                      )}
                      {key === 'kelly_sizing' && guard.enabled !== false && (
                        <p className="text-xs mt-1 text-gray-600">Mode: {guard.mode} | Win Rate: {guard.win_rate}% | Trades: {guard.total_trades}</p>
                      )}
                    </div>
                  </div>
                  {canToggle && (
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(v) => toggleGuard(key, v)}
                      disabled={loading}
                      data-testid={`toggle-${key}`}
                    />
                  )}
                  {!canToggle && (
                    <Badge className="bg-blue-100 text-blue-700 text-[10px]">Always ON</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
