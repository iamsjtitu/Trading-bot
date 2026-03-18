import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { FaBrain, FaChartPie, FaFire, FaShieldAlt, FaChartBar, FaSync, FaClock, FaBolt } from 'react-icons/fa';

const API = process.env.REACT_APP_BACKEND_URL || '';

export default function AIInsights() {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInsights();
    const interval = setInterval(fetchInsights, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchInsights = async () => {
    try {
      const res = await axios.get(`${API}/api/ai/insights`);
      if (res.data?.status === 'success') setInsights(res.data.insights);
    } catch (err) {
      console.error('AI insights error:', err);
    } finally { setLoading(false); }
  };

  if (loading) return <div className="text-center py-8 text-gray-500">Loading AI Insights...</div>;
  if (!insights) return <div className="text-center py-8 text-gray-500">AI Insights unavailable</div>;

  const regime = insights.market_regime || {};
  const rotation = insights.sector_rotation || {};
  const depth = insights.sentiment_depth || {};
  const perf = insights.performance || {};

  const regimeColors = {
    'TRENDING_UP': 'bg-green-100 text-green-800 border-green-300',
    'TRENDING_DOWN': 'bg-red-100 text-red-800 border-red-300',
    'SIDEWAYS': 'bg-yellow-100 text-yellow-800 border-yellow-300',
    'VOLATILE': 'bg-purple-100 text-purple-800 border-purple-300',
    'MIXED': 'bg-orange-100 text-orange-800 border-orange-300',
    'UNKNOWN': 'bg-gray-100 text-gray-600 border-gray-300',
  };

  const regimeIcons = {
    'TRENDING_UP': '↗', 'TRENDING_DOWN': '↘', 'SIDEWAYS': '→',
    'VOLATILE': '↕', 'MIXED': '⟳', 'UNKNOWN': '?',
  };

  return (
    <div className="space-y-4" data-testid="ai-insights-panel">
      {/* Market Regime & Performance Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Market Regime */}
        <Card className={`p-4 border-2 ${regimeColors[regime.regime] || regimeColors.UNKNOWN}`} data-testid="market-regime-card">
          <div className="flex items-center gap-3 mb-2">
            <FaBrain className="text-2xl" />
            <div>
              <p className="text-xs font-medium opacity-75">Market Regime</p>
              <p className="text-xl font-bold">
                {regimeIcons[regime.regime] || '?'} {(regime.regime || 'UNKNOWN').replace('_', ' ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white/50 rounded-full h-2">
              <div className="h-2 rounded-full bg-current opacity-60" style={{ width: `${regime.confidence || 0}%` }} />
            </div>
            <span className="text-xs font-bold">{regime.confidence || 0}%</span>
          </div>
          <p className="text-xs mt-2 opacity-75">
            Position multiplier: {insights.regime_multiplier || 1}x
          </p>
        </Card>

        {/* Trading Performance */}
        <Card className="p-4 bg-white border-gray-200 shadow-sm" data-testid="ai-performance-card">
          <div className="flex items-center gap-3 mb-2">
            <FaChartBar className="text-2xl text-blue-500" />
            <div>
              <p className="text-xs font-medium text-gray-500">AI Performance</p>
              <p className="text-xl font-bold text-gray-800">{perf.win_rate || 0}% Win Rate</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500">Trades: </span>
              <span className="font-semibold">{perf.closed_trades || 0}</span>
            </div>
            <div>
              <span className="text-gray-500">P&L: </span>
              <span className={`font-semibold ${(perf.total_pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(perf.total_pnl || 0) >= 0 ? '+' : ''}{Math.round(perf.total_pnl || 0)}
              </span>
            </div>
          </div>
        </Card>

        {/* Signal Depth */}
        <Card className="p-4 bg-white border-gray-200 shadow-sm" data-testid="signal-depth-card">
          <div className="flex items-center gap-3 mb-2">
            <FaClock className="text-2xl text-indigo-500" />
            <div>
              <p className="text-xs font-medium text-gray-500">Multi-Timeframe Depth</p>
              <p className="text-xl font-bold text-gray-800">{insights.signal_buffer_size || 0} Active</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center bg-blue-50 rounded p-1">
              <p className="font-bold text-blue-700">{depth['1h'] || 0}</p>
              <p className="text-blue-500">1hr</p>
            </div>
            <div className="text-center bg-indigo-50 rounded p-1">
              <p className="font-bold text-indigo-700">{depth['4h'] || 0}</p>
              <p className="text-indigo-500">4hr</p>
            </div>
            <div className="text-center bg-purple-50 rounded p-1">
              <p className="font-bold text-purple-700">{depth['daily'] || 0}</p>
              <p className="text-purple-500">Daily</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Sector Rotation */}
      <Card className="p-4 bg-white border-gray-200 shadow-sm" data-testid="sector-rotation-card">
        <div className="flex items-center gap-2 mb-3">
          <FaSync className="text-lg text-amber-500" />
          <h3 className="font-semibold text-gray-800">Sector Rotation</h3>
          <Badge className={rotation.rotation === 'ACTIVE' ? 'bg-amber-100 text-amber-700' : rotation.rotation === 'BROAD_BULLISH' ? 'bg-green-100 text-green-700' : rotation.rotation === 'BROAD_BEARISH' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}>
            {rotation.rotation || 'NONE'}
          </Badge>
        </div>

        {(rotation.leaders?.length > 0 || rotation.laggards?.length > 0) ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-green-600 mb-2 flex items-center gap-1"><FaFire /> Leaders</p>
              {(rotation.leaders || []).map((s, i) => (
                <div key={i} className="flex items-center justify-between bg-green-50 rounded p-2 mb-1">
                  <span className="text-sm font-medium">{s.sector}</span>
                  <Badge className="bg-green-200 text-green-800 text-xs">+{s.momentum}</Badge>
                </div>
              ))}
              {(!rotation.leaders || rotation.leaders.length === 0) && <p className="text-xs text-gray-400">No clear leaders</p>}
            </div>
            <div>
              <p className="text-xs font-medium text-red-600 mb-2 flex items-center gap-1"><FaShieldAlt /> Laggards</p>
              {(rotation.laggards || []).map((s, i) => (
                <div key={i} className="flex items-center justify-between bg-red-50 rounded p-2 mb-1">
                  <span className="text-sm font-medium">{s.sector}</span>
                  <Badge className="bg-red-200 text-red-800 text-xs">{s.momentum}</Badge>
                </div>
              ))}
              {(!rotation.laggards || rotation.laggards.length === 0) && <p className="text-xs text-gray-400">No clear laggards</p>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Collecting sector data... (Need 3+ signals per sector for rotation analysis)</p>
        )}
      </Card>

      {/* Sector Performance from History */}
      {insights.sector_performance && Object.keys(insights.sector_performance).length > 0 && (
        <Card className="p-4 bg-white border-gray-200 shadow-sm" data-testid="sector-performance-card">
          <div className="flex items-center gap-2 mb-3">
            <FaChartPie className="text-lg text-blue-500" />
            <h3 className="font-semibold text-gray-800">Historical Sector Performance</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(insights.sector_performance).sort((a, b) => b[1].win_rate - a[1].win_rate).map(([sector, data]) => (
              <div key={sector} className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-xs font-medium text-gray-600">{sector}</p>
                <p className={`text-lg font-bold ${data.win_rate >= 60 ? 'text-green-600' : data.win_rate >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {data.win_rate}%
                </p>
                <p className="text-xs text-gray-400">{data.total} trades</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* AI Decision Factors Legend */}
      <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 shadow-sm" data-testid="ai-factors-card">
        <div className="flex items-center gap-2 mb-2">
          <FaBolt className="text-lg text-blue-600" />
          <h3 className="font-semibold text-blue-800">AI Decision Factors</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <div className="bg-white/80 rounded p-2 text-center">
            <p className="font-bold text-blue-700">35%</p>
            <p className="text-gray-600">AI Confidence</p>
          </div>
          <div className="bg-white/80 rounded p-2 text-center">
            <p className="font-bold text-blue-700">20%</p>
            <p className="text-gray-600">Signal Correlation</p>
          </div>
          <div className="bg-white/80 rounded p-2 text-center">
            <p className="font-bold text-blue-700">20%</p>
            <p className="text-gray-600">Timeframe Confluence</p>
          </div>
          <div className="bg-white/80 rounded p-2 text-center">
            <p className="font-bold text-blue-700">15%</p>
            <p className="text-gray-600">News Freshness</p>
          </div>
          <div className="bg-white/80 rounded p-2 text-center">
            <p className="font-bold text-blue-700">10%</p>
            <p className="text-gray-600">Historical Patterns</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
