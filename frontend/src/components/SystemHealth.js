/**
 * System Health Dashboard
 * Real-time monitoring of all background services, connections, and system status.
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FaSync } from 'react-icons/fa';

const API = (() => {
  const envUrl = process.env.REACT_APP_BACKEND_URL || '';
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) return '';
  return envUrl;
})() + '/api';

const REFRESH_INTERVAL = 10000;

function StatusDot({ ok }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]'}`}
      data-testid={`status-dot-${ok ? 'ok' : 'error'}`}
    />
  );
}

function ServiceCard({ title, status, details, icon }) {
  const isOk = status === 'running' || status === 'healthy' || status === 'configured' || status === 'active' || status === true;
  return (
    <Card className="bg-white border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow" data-testid={`service-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${isOk ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <StatusDot ok={isOk} />
            <span className={`text-xs font-medium ${isOk ? 'text-green-700' : 'text-red-600'}`}>
              {typeof status === 'boolean' ? (status ? 'Active' : 'Inactive') : String(status).toUpperCase()}
            </span>
          </div>
        </div>
      </div>
      {details && details.length > 0 && (
        <div className="space-y-1.5 border-t border-gray-100 pt-2.5">
          {details.map((d, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-gray-500">{d.label}</span>
              <span className={`font-medium ${d.highlight === 'good' ? 'text-green-700' : d.highlight === 'warn' ? 'text-yellow-700' : d.highlight === 'bad' ? 'text-red-600' : 'text-gray-800'}`}>
                {d.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function SystemHealth() {
  const [health, setHealth] = useState(null);
  const [telegram, setTelegram] = useState(null);
  const [guards, setGuards] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, t, g] = await Promise.all([
        axios.get(`${API}/health`).catch(() => ({ data: null })),
        axios.get(`${API}/telegram/status`).catch(() => ({ data: null })),
        axios.get(`${API}/ai-guards/status`).catch(() => ({ data: null })),
      ]);
      setHealth(h.data);
      setTelegram(t.data);
      setGuards(g.data);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const bg = health?.background_fetcher || {};
  const advisor = health?.exit_advisor || {};
  const briefing = health?.morning_briefing || {};
  const tgStatus = telegram?.telegram || {};
  const tgAlerts = telegram?.alerts || {};
  const guardsList = guards?.guards || {};
  const activeGuardCount = Object.values(guardsList).filter(g => g.enabled).length;
  const totalGuardCount = Object.keys(guardsList).length;

  const formatTimeAgo = (iso) => {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
    return `${Math.round(diff / 3600000)}h ago`;
  };

  return (
    <div className="space-y-6" data-testid="system-health-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800" data-testid="system-health-title">System Health</h2>
          <p className="text-sm text-gray-500">
            Real-time status of all services
            {lastRefresh && <span className="ml-2 text-xs text-gray-400">| Updated {formatTimeAgo(lastRefresh.toISOString())}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={health?.status === 'healthy' ? 'bg-green-600' : 'bg-red-600'} data-testid="overall-status-badge">
            {health?.status === 'healthy' ? 'ALL SYSTEMS GO' : 'DEGRADED'}
          </Badge>
          <Badge className="bg-gray-700" data-testid="version-badge">v{health?.version || '...'}</Badge>
          <Button onClick={fetchAll} disabled={loading} variant="outline" size="sm" className="border-gray-300" data-testid="refresh-health-btn">
            <FaSync className={`mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm" data-testid="health-error">
          Error fetching system status: {error}
        </div>
      )}

      {/* Overview Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4 shadow-md" data-testid="overview-routes">
          <p className="text-xs opacity-80">Routes Loaded</p>
          <p className="text-2xl font-bold">{health?.routes_loaded || 0}/13</p>
        </Card>
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white p-4 shadow-md" data-testid="overview-guards">
          <p className="text-xs opacity-80">AI Guards Active</p>
          <p className="text-2xl font-bold">{activeGuardCount}/{totalGuardCount}</p>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-4 shadow-md" data-testid="overview-telegram">
          <p className="text-xs opacity-80">Telegram Alerts</p>
          <p className="text-2xl font-bold">{Object.values(tgAlerts).filter(Boolean).length}/{Object.keys(tgAlerts).length}</p>
        </Card>
        <Card className={`bg-gradient-to-br ${advisor?.market_hours ? 'from-orange-500 to-red-500' : 'from-gray-500 to-gray-600'} text-white p-4 shadow-md`} data-testid="overview-market">
          <p className="text-xs opacity-80">Market Status</p>
          <p className="text-lg font-bold">{advisor?.market_hours ? 'OPEN' : 'CLOSED'}</p>
        </Card>
      </div>

      {/* Background Services */}
      <div>
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Background Services</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ServiceCard
            title="Market Data Fetcher"
            status={bg.running ? 'running' : 'stopped'}
            icon={<span>&#x1f4ca;</span>}
            details={[
              { label: 'Fetches', value: bg.fetch_count || 0 },
              { label: 'Last Status', value: bg.last_status || 'idle', highlight: bg.last_status === 'success' ? 'good' : bg.last_status === 'no_token' ? 'warn' : undefined },
              { label: 'Last Fetch', value: formatTimeAgo(bg.last_fetch) },
              { label: 'Errors', value: bg.error_count || 0, highlight: (bg.error_count || 0) > 0 ? 'bad' : 'good' },
            ]}
          />
          <ServiceCard
            title="AI Exit Advisor"
            status={advisor.running ? 'running' : 'stopped'}
            icon={<span>&#x1f916;</span>}
            details={[
              { label: 'Checks', value: advisor.check_count || 0 },
              { label: 'Active Advice', value: advisor.active_advice_count || 0 },
              { label: 'Last Check', value: formatTimeAgo(advisor.last_check) },
              { label: 'Market Hours', value: advisor.market_hours ? 'Yes' : 'No', highlight: advisor.market_hours ? 'good' : undefined },
            ]}
          />
          <ServiceCard
            title="Morning Briefing"
            status={briefing.running ? 'running' : 'stopped'}
            icon={<span>&#x2600;&#xfe0f;</span>}
            details={[
              { label: 'Sent Count', value: briefing.sent_count || 0 },
              { label: 'Last Sent', value: formatTimeAgo(briefing.last_sent) },
              { label: 'Next', value: briefing.next_briefing || 'N/A' },
              { label: 'Is Briefing Time', value: briefing.is_briefing_time ? 'Yes' : 'No', highlight: briefing.is_briefing_time ? 'good' : undefined },
            ]}
          />
        </div>
      </div>

      {/* Connections */}
      <div>
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Connections</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ServiceCard
            title="Telegram Bot"
            status={tgStatus.configured ? 'configured' : 'not configured'}
            icon={<span>&#x2709;&#xfe0f;</span>}
            details={[
              { label: 'Has Token', value: tgStatus.has_token ? 'Yes' : 'No', highlight: tgStatus.has_token ? 'good' : 'bad' },
              { label: 'Chat ID', value: tgStatus.chat_id || 'Not set', highlight: tgStatus.has_chat_id ? 'good' : 'bad' },
              { label: 'Messages Sent', value: tgStatus.sent_count || 0 },
              { label: 'Recent Errors', value: (tgStatus.recent_errors || []).length, highlight: (tgStatus.recent_errors || []).length > 0 ? 'warn' : 'good' },
            ]}
          />
          <ServiceCard
            title="API Services"
            status={health?.status || 'unknown'}
            icon={<span>&#x26a1;</span>}
            details={[
              { label: 'News Service', value: health?.services?.news || 'N/A', highlight: health?.services?.news === 'active' ? 'good' : 'bad' },
              { label: 'Sentiment AI', value: health?.services?.sentiment || 'N/A', highlight: health?.services?.sentiment === 'active' ? 'good' : 'bad' },
              { label: 'Trading Engine', value: health?.services?.trading || 'N/A', highlight: health?.services?.trading === 'active' ? 'good' : 'bad' },
              { label: 'Routes', value: `${health?.routes_loaded || 0}/13`, highlight: health?.routes_loaded === 13 ? 'good' : 'bad' },
            ]}
          />
        </div>
      </div>

      {/* AI Guards Detail */}
      <div>
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">AI Guards ({activeGuardCount}/{totalGuardCount} Active)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(guardsList).map(([key, guard]) => (
            <Card
              key={key}
              className={`p-3 border ${guard.enabled ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-gray-50/50'} shadow-sm`}
              data-testid={`guard-card-${key}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <StatusDot ok={guard.enabled} />
                <span className="text-sm font-medium text-gray-800 capitalize">
                  {key.replace(/_/g, ' ')}
                </span>
              </div>
              {guard.blocked && (
                <Badge className="bg-red-100 text-red-700 text-[10px] mt-1">BLOCKING</Badge>
              )}
              {guard.current_regime && (
                <p className="text-xs text-gray-500 mt-1">Regime: {guard.current_regime}</p>
              )}
              {guard.current_window && (
                <p className="text-xs text-gray-500 mt-1">{guard.current_window}</p>
              )}
              {guard.mode && (
                <p className="text-xs text-gray-500 mt-1">Mode: {guard.mode}</p>
              )}
              {guard.today_loss !== undefined && (
                <p className="text-xs text-gray-500 mt-1">Loss: {guard.today_loss}/{guard.limit}</p>
              )}
              {guard.win_rate !== undefined && (
                <p className="text-xs text-gray-500 mt-1">WR: {guard.win_rate}% ({guard.total_trades} trades)</p>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Telegram Alerts Detail */}
      <div>
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Telegram Alert Types</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(tgAlerts).map(([key, enabled]) => (
            <Badge
              key={key}
              className={enabled ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-gray-100 text-gray-500 border border-gray-200'}
              data-testid={`alert-badge-${key}`}
            >
              <StatusDot ok={enabled} />
              <span className="ml-1.5 capitalize">{key.replace(/_/g, ' ')}</span>
            </Badge>
          ))}
        </div>
      </div>

      {/* System Info */}
      <Card className="bg-gray-50 border border-gray-200 p-4 shadow-sm" data-testid="system-info-card">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">System Info</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div><span className="text-gray-500">Version</span><p className="font-mono font-semibold text-gray-800">v{health?.version || '...'}</p></div>
          <div><span className="text-gray-500">Server Time</span><p className="font-mono font-semibold text-gray-800">{health?.timestamp ? new Date(health.timestamp).toLocaleTimeString('en-IN') : '...'}</p></div>
          <div><span className="text-gray-500">IST Time</span><p className="font-mono font-semibold text-gray-800">{guards?.current_time || '...'}</p></div>
          <div><span className="text-gray-500">Auto Refresh</span><p className="font-mono font-semibold text-green-700">Every {REFRESH_INTERVAL / 1000}s</p></div>
        </div>
      </Card>
    </div>
  );
}
