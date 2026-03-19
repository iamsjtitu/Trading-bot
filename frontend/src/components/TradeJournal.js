import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FaRobot, FaChartLine, FaStar, FaExclamationTriangle, FaLightbulb, FaSync, FaFilter } from 'react-icons/fa';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL || ''}/api`;

const VERDICT_COLORS = {
  EXCELLENT: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  GOOD: 'bg-green-100 text-green-800 border-green-300',
  AVERAGE: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  POOR: 'bg-orange-100 text-orange-800 border-orange-300',
  BAD: 'bg-red-100 text-red-800 border-red-300',
};

const EMOTION_COLORS = {
  DISCIPLINED: 'bg-blue-50 text-blue-700',
  PATIENT: 'bg-teal-50 text-teal-700',
  FOMO: 'bg-orange-50 text-orange-700',
  REVENGE_TRADE: 'bg-red-50 text-red-700',
  OVERCONFIDENT: 'bg-yellow-50 text-yellow-700',
  IMPULSIVE: 'bg-pink-50 text-pink-700',
  NONE: 'bg-gray-50 text-gray-500',
};

function RatingStars({ rating }) {
  const stars = [];
  const full = Math.floor(rating / 2);
  const half = rating % 2 >= 1;
  for (let i = 0; i < 5; i++) {
    if (i < full) stars.push(<FaStar key={i} className="text-amber-400 inline" />);
    else if (i === full && half) stars.push(<FaStar key={i} className="text-amber-200 inline" />);
    else stars.push(<FaStar key={i} className="text-gray-200 inline" />);
  }
  return <span className="inline-flex items-center gap-0.5">{stars} <span className="text-xs text-gray-500 ml-1">{rating}/10</span></span>;
}

function JournalEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const isProfitable = entry.pnl > 0;

  return (
    <Card
      data-testid={`journal-entry-${entry.id}`}
      className={`p-4 border-l-4 cursor-pointer transition-all hover:shadow-md ${isProfitable ? 'border-l-emerald-500' : 'border-l-red-400'}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${isProfitable ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {entry.trade_type === 'CALL' || entry.trade_type === 'BUY' ? 'CE' : 'PE'}
          </div>
          <div>
            <div className="font-semibold text-sm">{entry.symbol}</div>
            <div className="text-xs text-gray-500">
              {entry.entry_time ? new Date(entry.entry_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''} | {entry.hold_duration_mins}m hold
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`text-right ${isProfitable ? 'text-emerald-600' : 'text-red-600'}`}>
            <div className="font-bold text-sm">{isProfitable ? '+' : ''}{Math.round(entry.pnl).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</div>
            <div className="text-xs">{isProfitable ? '+' : ''}{entry.pnl_percentage}%</div>
          </div>
          <Badge className={`text-xs border ${VERDICT_COLORS[entry.verdict] || VERDICT_COLORS.AVERAGE}`}>
            {entry.verdict}
          </Badge>
          <RatingStars rating={entry.rating} />
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-3 border-t border-gray-100 space-y-3 text-sm" data-testid={`journal-detail-${entry.id}`}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-gray-500">Entry:</span> <span className="font-medium">Rs.{entry.entry_price}</span>
            </div>
            <div>
              <span className="text-gray-500">Exit:</span> <span className="font-medium">Rs.{entry.exit_price}</span>
            </div>
            <div>
              <span className="text-gray-500">Confidence:</span> <span className="font-medium">{entry.confidence}%</span>
            </div>
            <div>
              <span className="text-gray-500">Exit Reason:</span> <span className="font-medium">{(entry.exit_reason || '').replace(/_/g, ' ')}</span>
            </div>
          </div>

          <div className="bg-emerald-50 rounded-lg p-3">
            <div className="font-medium text-emerald-800 text-xs mb-1">What Went Right</div>
            <div className="text-emerald-700">{entry.what_went_right}</div>
          </div>

          <div className="bg-red-50 rounded-lg p-3">
            <div className="font-medium text-red-800 text-xs mb-1">What Went Wrong</div>
            <div className="text-red-700">{entry.what_went_wrong}</div>
          </div>

          <div className="bg-blue-50 rounded-lg p-3">
            <div className="font-medium text-blue-800 text-xs mb-1">Improvement Tip</div>
            <div className="text-blue-700">{entry.improvement}</div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(entry.pattern_tags || []).map(tag => (
              <Badge key={tag} variant="outline" className="text-xs bg-gray-50">{tag.replace(/_/g, ' ')}</Badge>
            ))}
            {entry.emotion_flag && entry.emotion_flag !== 'NONE' && (
              <Badge className={`text-xs ${EMOTION_COLORS[entry.emotion_flag] || ''}`}>
                {entry.emotion_flag.replace(/_/g, ' ')}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {entry.ai_source === 'gpt-4o' ? 'AI Reviewed' : 'Auto Review'}
            </Badge>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <div className="font-medium text-gray-600 text-xs mb-1">Risk Assessment</div>
            <div className="text-gray-700">{entry.risk_assessment}</div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function TradeJournal() {
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reviewingAll, setReviewingAll] = useState(false);
  const [view, setView] = useState('entries'); // entries | stats | insights

  const fetchEntries = useCallback(async () => {
    try {
      const resp = await axios.get(`${API}/journal/entries?limit=100`);
      if (resp.data?.status === 'success') setEntries(resp.data.entries || []);
    } catch (err) { console.error('Journal entries fetch error:', err); }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const resp = await axios.get(`${API}/journal/stats`);
      if (resp.data?.status === 'success') setStats(resp.data.stats);
    } catch (err) { console.error('Journal stats fetch error:', err); }
  }, []);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await axios.get(`${API}/journal/insights`);
      if (resp.data?.status === 'success') setInsights(resp.data.insights);
    } catch (err) { console.error('Journal insights fetch error:', err); }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEntries();
    fetchStats();
  }, [fetchEntries, fetchStats]);

  const handleReviewAll = async () => {
    setReviewingAll(true);
    try {
      const resp = await axios.post(`${API}/journal/review-all`);
      if (resp.data?.status === 'success') {
        await fetchEntries();
        await fetchStats();
      }
    } catch (err) { console.error('Review all error:', err); }
    setReviewingAll(false);
  };

  const totalPnl = stats?.total_pnl || 0;
  const avgRating = stats?.avg_rating || 0;

  return (
    <div className="space-y-4" data-testid="trade-journal">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FaRobot className="text-indigo-600 text-lg" />
          <h2 className="text-lg font-bold text-gray-800">AI Trade Journal</h2>
          <Badge variant="outline" className="text-xs">{entries.length} reviews</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            data-testid="review-all-btn"
            onClick={handleReviewAll}
            disabled={reviewingAll}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            <FaSync className={`mr-1 ${reviewingAll ? 'animate-spin' : ''}`} />
            {reviewingAll ? 'Reviewing...' : 'Review All Trades'}
          </Button>
        </div>
      </div>

      {/* Quick Stats Bar */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="p-3 text-center">
            <div className="text-xs text-gray-500">Total Reviewed</div>
            <div className="font-bold text-lg">{stats.total}</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xs text-gray-500">Win Rate</div>
            <div className={`font-bold text-lg ${stats.win_rate >= 50 ? 'text-emerald-600' : 'text-red-600'}`}>{stats.win_rate}%</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xs text-gray-500">Avg Rating</div>
            <div className="font-bold text-lg text-amber-600">{avgRating}/10</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xs text-gray-500">Total P&L</div>
            <div className={`font-bold text-lg ${totalPnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {totalPnl >= 0 ? '+' : ''}{Math.round(totalPnl).toLocaleString('en-IN')}
            </div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xs text-gray-500">Avg Hold</div>
            <div className="font-bold text-lg text-blue-600">{stats.avg_hold_duration}m</div>
          </Card>
        </div>
      )}

      {/* View Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button
          data-testid="journal-entries-tab"
          className={`px-4 py-1.5 text-sm rounded-t-lg font-medium transition-colors ${view === 'entries' ? 'bg-indigo-100 text-indigo-800 border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setView('entries')}
        >
          Trade Reviews
        </button>
        <button
          data-testid="journal-stats-tab"
          className={`px-4 py-1.5 text-sm rounded-t-lg font-medium transition-colors ${view === 'stats' ? 'bg-indigo-100 text-indigo-800 border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => { setView('stats'); fetchStats(); }}
        >
          Patterns & Stats
        </button>
        <button
          data-testid="journal-insights-tab"
          className={`px-4 py-1.5 text-sm rounded-t-lg font-medium transition-colors ${view === 'insights' ? 'bg-indigo-100 text-indigo-800 border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => { setView('insights'); if (!insights) fetchInsights(); }}
        >
          AI Insights
        </button>
      </div>

      {/* Entries View */}
      {view === 'entries' && (
        <div className="space-y-3">
          {entries.length === 0 ? (
            <Card className="p-8 text-center">
              <FaRobot className="text-4xl text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No journal entries yet.</p>
              <p className="text-gray-400 text-xs mt-1">Close some trades and click "Review All Trades" to get started.</p>
              <Button onClick={handleReviewAll} disabled={reviewingAll} size="sm" className="mt-4 bg-indigo-600 hover:bg-indigo-700">
                <FaSync className={`mr-1 ${reviewingAll ? 'animate-spin' : ''}`} />
                {reviewingAll ? 'Reviewing...' : 'Review All Trades'}
              </Button>
            </Card>
          ) : (
            entries.map(entry => <JournalEntry key={entry.id} entry={entry} />)
          )}
        </div>
      )}

      {/* Stats View */}
      {view === 'stats' && stats && stats.total > 0 && (
        <div className="space-y-4">
          {/* Verdict Distribution */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><FaChartLine className="text-indigo-500" /> Verdict Distribution</h3>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(stats.verdict_distribution || {}).map(([verdict, count]) => (
                <div key={verdict} className={`px-3 py-2 rounded-lg border text-center min-w-[80px] ${VERDICT_COLORS[verdict] || ''}`}>
                  <div className="font-bold text-lg">{count}</div>
                  <div className="text-xs">{verdict}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Emotion Distribution */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3">Trading Psychology</h3>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(stats.emotion_distribution || {}).filter(([k]) => k !== 'NONE').map(([emotion, count]) => (
                <Badge key={emotion} className={`text-xs py-1 px-2 ${EMOTION_COLORS[emotion] || ''}`}>
                  {emotion.replace(/_/g, ' ')}: {count}
                </Badge>
              ))}
            </div>
          </Card>

          {/* Sector Performance */}
          {Object.keys(stats.sector_performance || {}).length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-3">Sector Performance</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-500 text-xs"><th className="pb-2">Sector</th><th className="pb-2">Trades</th><th className="pb-2">Win Rate</th><th className="pb-2">P&L</th><th className="pb-2">Avg Rating</th></tr></thead>
                  <tbody>
                    {Object.entries(stats.sector_performance).sort((a, b) => b[1].total_pnl - a[1].total_pnl).map(([sector, data]) => (
                      <tr key={sector} className="border-t border-gray-50">
                        <td className="py-2 font-medium">{sector}</td>
                        <td className="py-2">{data.trades}</td>
                        <td className={`py-2 font-medium ${data.win_rate >= 50 ? 'text-emerald-600' : 'text-red-600'}`}>{data.win_rate}%</td>
                        <td className={`py-2 font-medium ${data.total_pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{data.total_pnl >= 0 ? '+' : ''}{Math.round(data.total_pnl)}</td>
                        <td className="py-2">{data.avg_rating}/10</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Tag Frequency */}
          {Object.keys(stats.tag_frequency || {}).length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-3"><FaFilter className="inline text-indigo-500 mr-1" /> Trade Patterns</h3>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(stats.tag_frequency).sort((a, b) => b[1] - a[1]).map(([tag, count]) => (
                  <Badge key={tag} variant="outline" className="text-xs py-1">
                    {tag.replace(/_/g, ' ')} ({count})
                  </Badge>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Insights View */}
      {view === 'insights' && (
        <div className="space-y-4">
          {loading ? (
            <Card className="p-8 text-center">
              <FaSync className="animate-spin text-2xl text-indigo-400 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Generating AI insights...</p>
            </Card>
          ) : !insights ? (
            <Card className="p-8 text-center">
              <FaLightbulb className="text-4xl text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Click to load AI insights</p>
              <Button onClick={fetchInsights} size="sm" className="mt-3 bg-indigo-600 hover:bg-indigo-700">Generate Insights</Button>
            </Card>
          ) : (
            <>
              {/* AI Coach Insight */}
              {insights.ai_insight && (
                <Card className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
                  <div className="flex items-start gap-3">
                    <FaRobot className="text-indigo-600 text-xl mt-0.5" />
                    <div>
                      <div className="font-semibold text-sm text-indigo-800 mb-1">AI Trading Coach</div>
                      <p className="text-sm text-indigo-700 leading-relaxed">{insights.ai_insight}</p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Patterns */}
              {(insights.patterns || []).length > 0 && (
                <Card className="p-4">
                  <h3 className="font-semibold text-sm mb-3">Detected Patterns</h3>
                  <div className="space-y-2">
                    {insights.patterns.map((p, i) => (
                      <div key={i} className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
                        p.type === 'strength' ? 'bg-emerald-50 text-emerald-800' :
                        p.type === 'weakness' ? 'bg-red-50 text-red-800' :
                        p.type === 'warning' ? 'bg-amber-50 text-amber-800' :
                        'bg-blue-50 text-blue-800'
                      }`}>
                        {p.type === 'warning' ? <FaExclamationTriangle className="mt-0.5 shrink-0" /> :
                         p.type === 'strength' ? <FaChartLine className="mt-0.5 shrink-0" /> :
                         <FaLightbulb className="mt-0.5 shrink-0" />}
                        <span>{p.message}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Suggestions */}
              {(insights.suggestions || []).length > 0 && (
                <Card className="p-4">
                  <h3 className="font-semibold text-sm mb-3"><FaLightbulb className="inline text-amber-500 mr-1" /> Suggestions</h3>
                  <ul className="space-y-2">
                    {insights.suggestions.map((s, i) => (
                      <li key={i} className="text-sm text-gray-700 bg-amber-50 p-2 rounded">{s}</li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* Trade Type Performance */}
              {insights.trade_type_performance && (
                <Card className="p-4">
                  <h3 className="font-semibold text-sm mb-3">CALL vs PUT Performance</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-xs text-gray-500">CALL Trades</div>
                      <div className="font-bold text-xl text-green-700">{insights.trade_type_performance.call.win_rate}%</div>
                      <div className="text-xs text-gray-500">{insights.trade_type_performance.call.count} trades</div>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <div className="text-xs text-gray-500">PUT Trades</div>
                      <div className="font-bold text-xl text-red-700">{insights.trade_type_performance.put.win_rate}%</div>
                      <div className="text-xs text-gray-500">{insights.trade_type_performance.put.count} trades</div>
                    </div>
                  </div>
                </Card>
              )}

              <Button onClick={fetchInsights} variant="outline" size="sm" className="w-full">
                <FaSync className="mr-1" /> Refresh Insights
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
