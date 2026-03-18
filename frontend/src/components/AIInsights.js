import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { FaBrain, FaChartPie, FaFire, FaShieldAlt, FaChartBar, FaSync, FaClock, FaBolt, FaTh } from 'react-icons/fa';

const API = process.env.REACT_APP_BACKEND_URL || '';

// ===== Heatmap Cell Color Logic =====
function getCellColor(cell) {
  if (!cell || cell.total === 0) return 'bg-gray-100 text-gray-400';
  const { bullish, bearish, total, avg_confidence } = cell;
  const bullRatio = bullish / total;
  const bearRatio = bearish / total;

  if (bullRatio >= 0.7 && avg_confidence >= 70) return 'bg-green-600 text-white';
  if (bullRatio >= 0.6 && avg_confidence >= 60) return 'bg-green-400 text-white';
  if (bullRatio >= 0.5) return 'bg-green-200 text-green-900';
  if (bearRatio >= 0.7 && avg_confidence >= 70) return 'bg-red-600 text-white';
  if (bearRatio >= 0.6 && avg_confidence >= 60) return 'bg-red-400 text-white';
  if (bearRatio >= 0.5) return 'bg-red-200 text-red-900';
  return 'bg-yellow-100 text-yellow-800';
}

function getCellLabel(cell) {
  if (!cell || cell.total === 0) return '--';
  const { bullish, bearish, total, avg_confidence } = cell;
  const bullRatio = bullish / total;
  const bearRatio = bearish / total;
  if (bullRatio >= 0.6) return `${avg_confidence}`;
  if (bearRatio >= 0.6) return `${avg_confidence}`;
  return `${avg_confidence}`;
}

function getSummaryBadge(summary) {
  if (!summary || summary.total === 0) return { text: 'No Data', color: 'bg-gray-200 text-gray-500' };
  const { bullish, bearish, total, avg_confidence } = summary;
  const bullRatio = bullish / total;
  const bearRatio = bearish / total;
  if (bullRatio >= 0.65) return { text: `Bullish ${avg_confidence}%`, color: 'bg-green-100 text-green-700' };
  if (bearRatio >= 0.65) return { text: `Bearish ${avg_confidence}%`, color: 'bg-red-100 text-red-700' };
  return { text: `Mixed ${avg_confidence}%`, color: 'bg-yellow-100 text-yellow-700' };
}

// ===== Confidence Heatmap Component =====
function ConfidenceHeatmap({ data }) {
  if (!data) return null;

  const { heatmap, sector_summary, active_sectors, time_buckets, sectors } = data;
  const activeSectorKeys = Object.keys(active_sectors || {});

  // Show all sectors with data + always show key sectors
  const displaySectors = sectors.filter(s => activeSectorKeys.includes(s) || ['BANKING', 'IT', 'BROAD_MARKET'].includes(s));
  const bucketLabels = { '0-4h': 'Last 4h', '4-8h': '4-8h', '8-12h': '8-12h', '12-16h': '12-16h', '16-20h': '16-20h', '20-24h': '20-24h' };

  return (
    <Card className="p-4 bg-white border-gray-200 shadow-sm" data-testid="confidence-heatmap-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FaTh className="text-lg text-orange-500" />
          <h3 className="font-semibold text-gray-800">Sector Confidence Heatmap</h3>
          <span className="text-xs text-gray-400">Last 24 hours</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-600 inline-block" /> Strong Bull</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-300 inline-block" /> Bull</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-200 inline-block" /> Mixed</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-300 inline-block" /> Bear</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-600 inline-block" /> Strong Bear</span>
        </div>
      </div>

      {displaySectors.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">No sector data yet. Fetch news to populate the heatmap.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="heatmap-table">
            <thead>
              <tr>
                <th className="text-left p-2 font-semibold text-gray-600 w-28">Sector</th>
                {time_buckets.map(b => (
                  <th key={b} className="text-center p-2 font-medium text-gray-500">{bucketLabels[b] || b}</th>
                ))}
                <th className="text-center p-2 font-semibold text-gray-600 w-28">24h Summary</th>
              </tr>
            </thead>
            <tbody>
              {displaySectors.map(sector => {
                const summary = (sector_summary || {})[sector] || {};
                const badge = getSummaryBadge(summary);
                return (
                  <tr key={sector} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="p-2 font-semibold text-gray-700">{sector}</td>
                    {time_buckets.map(bucket => {
                      const cell = (heatmap || {})[sector]?.[bucket] || {};
                      const color = getCellColor(cell);
                      const label = getCellLabel(cell);
                      return (
                        <td key={bucket} className="p-1 text-center">
                          <div
                            className={`rounded-md py-2 px-1 font-bold text-sm transition-all ${color}`}
                            title={cell.total > 0 ? `${cell.bullish}B / ${cell.bearish}Be / ${cell.neutral}N (${cell.total} total) - Avg: ${cell.avg_confidence}%` : 'No data'}
                            data-testid={`heatmap-cell-${sector}-${bucket}`}
                          >
                            {label}
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-1 text-center">
                      <Badge className={`text-xs ${badge.color}`} data-testid={`heatmap-summary-${sector}`}>{badge.text}</Badge>
                      {summary.total > 0 && (
                        <p className="text-gray-400 text-xs mt-0.5">{summary.total} signals</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3 text-center">
        Cell values show average confidence %. Hover for breakdown. Green = Bullish dominant. Red = Bearish dominant. Yellow = Mixed.
      </p>
    </Card>
  );
}

export default function AIInsights() {
  const [insights, setInsights] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAll = async () => {
    try {
      const [insightsRes, heatmapRes] = await Promise.all([
        axios.get(`${API}/api/ai/insights`),
        axios.get(`${API}/api/ai/heatmap`),
      ]);
      if (insightsRes.data?.status === 'success') setInsights(insightsRes.data.insights);
      if (heatmapRes.data?.status === 'success') setHeatmap(heatmapRes.data);
    } catch (err) {
      console.error('AI data error:', err);
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

      {/* Confidence Heatmap */}
      <ConfidenceHeatmap data={heatmap} />
    </div>
  );
}
