import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  kelly_sizing: { label: 'Smart Position Sizing (Kelly)', icon: FaChartLine, desc: 'AI decide kare kitna invest karna hai - win rate, streak, drawdown sab dekhke. Losing streak mein size reduce.' },
  greeks_filter: { label: 'Options Greeks & IV Filter', icon: FaLayerGroup, desc: 'Delta, Theta, IV check karke bekar options avoid. High theta decay ya expensive IV wale options block.' },
};

export default function AIGuards() {
  const [guards, setGuards] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <Card className="p-5" data-testid="ai-guards-panel">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FaShieldAlt className="text-blue-600" />
          <h3 className="font-bold text-gray-800 text-base">AI Loss Prevention Guards</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{currentTime}</span>
          <button onClick={fetchStatus} className="text-gray-400 hover:text-blue-600 transition" data-testid="refresh-guards-btn"><FaSync className="text-sm" /></button>
        </div>
      </div>

      <div className="space-y-3">
        {Object.entries(GUARD_INFO).map(([key, info]) => {
          const guard = guards[key] || {};
          const Icon = info.icon;
          const isBlocked = guard.blocked;
          const isEnabled = guard.enabled !== false;
          const canToggle = key !== 'max_daily_loss'; // max_daily_loss is always on

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
                    {/* Extra status info */}
                    {key === 'market_regime_filter' && guard.current_regime && (
                      <p className="text-xs mt-1 font-medium text-gray-600">Current: {guard.current_regime} ({guard.confidence}%)</p>
                    )}
                    {key === 'time_of_day_filter' && guard.current_window && (
                      <p className={`text-xs mt-1 font-medium ${guard.current_window.includes('BLOCKED') ? 'text-red-600' : 'text-green-600'}`}>{guard.current_window}</p>
                    )}
                    {key === 'max_daily_loss' && (
                      <p className={`text-xs mt-1 font-medium ${guard.blocked ? 'text-red-600' : 'text-gray-600'}`}>
                        Today's Loss: ₹{guard.today_loss?.toLocaleString('en-IN')} / ₹{guard.limit?.toLocaleString('en-IN')}
                      </p>
                    )}
                    {key === 'multi_source_verification' && guard.recent_sources && Object.keys(guard.recent_sources).length > 0 && (
                      <p className="text-xs mt-1 text-gray-600">Recent: {Object.entries(guard.recent_sources).map(([dir, count]) => `${dir}: ${count} sources`).join(', ')}</p>
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
    </Card>
  );
}
