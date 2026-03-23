import { FaRobot, FaCog, FaSync } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function AppHeader({
  tradingMode, brokerConnected, brokerProfile, wsConnected,
  autoAnalyze, setAutoAnalyze, nextAnalysis, formatCountdown,
  setShowSettings, loading, loadData, fetchingNews, fetchNewNews,
}) {
  return (
    <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-2 rounded-lg shadow-lg">
              <FaRobot className="text-2xl text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800" data-testid="app-title">AI Trading Bot</h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-600">News-Based Options Trading</p>
                <Badge data-testid="trading-mode-badge" className={tradingMode === 'LIVE' ? 'bg-red-600 animate-pulse' : 'bg-blue-600'}>
                  {tradingMode === 'LIVE' ? 'LIVE TRADING' : 'PAPER MODE'}
                </Badge>
                {tradingMode === 'LIVE' && (
                  <Badge data-testid="broker-status-badge" className={brokerConnected ? 'bg-green-600' : 'bg-yellow-600'}>
                    {brokerConnected ? `${brokerProfile?.broker || 'Broker'}: ${brokerProfile?.name || 'Connected'}` : 'Broker: Disconnected'}
                  </Badge>
                )}
                {tradingMode === 'LIVE' && brokerConnected && (
                  <Badge data-testid="ws-status-badge" className={wsConnected ? 'bg-emerald-600' : 'bg-orange-500'}>
                    {wsConnected ? 'WS: Live' : 'WS: Polling'}
                  </Badge>
                )}
              </div>
            </div>
            {autoAnalyze && nextAnalysis && (
              <div className="ml-4 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium border border-green-300">
                Auto-Analysis ON | Next: {formatCountdown(nextAnalysis)}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowSettings(true)} variant="outline" className="border-gray-300 hover:bg-gray-100 text-gray-700" data-testid="settings-button"><FaCog /></Button>
            <Button onClick={() => setAutoAnalyze(!autoAnalyze)} variant={autoAnalyze ? "default" : "outline"} className={autoAnalyze ? "bg-green-600 hover:bg-green-700 text-white" : "border-gray-300 hover:bg-gray-100 text-gray-700"} data-testid="auto-analyze-toggle">
              {autoAnalyze ? 'Auto ON' : 'Auto OFF'}
            </Button>
            <Button onClick={loadData} disabled={loading} variant="outline" className="border-gray-300 hover:bg-gray-100 text-gray-700" data-testid="refresh-button">
              <FaSync className={loading ? 'animate-spin' : ''} />
            </Button>
            <Button onClick={fetchNewNews} disabled={fetchingNews} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg" data-testid="fetch-news-button">
              {fetchingNews ? 'Fetching...' : 'Analyze Now'}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
