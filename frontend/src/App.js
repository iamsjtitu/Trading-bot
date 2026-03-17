import { useState, useEffect } from 'react';
import '@/App.css';
import axios from 'axios';
import { FaChartLine, FaBullseye, FaWallet, FaSync, FaRobot, FaCog } from 'react-icons/fa';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SettingsPanel from '@/components/SettingsPanel';
import MarketTicker from '@/components/MarketTicker';
import RiskPanel from '@/components/RiskPanel';
import NewsFeed from '@/components/NewsFeed';
import TradesList from '@/components/TradesList';
import SignalsList from '@/components/SignalsList';
import AutoTradingSettings from '@/components/AutoTradingSettings';
import PositionCalculator from '@/components/PositionCalculator';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [portfolio, setPortfolio] = useState(null);
  const [news, setNews] = useState([]);
  const [signals, setSignals] = useState([]);
  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingNews, setFetchingNews] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [nextAnalysis, setNextAnalysis] = useState(null);
  const [emergencyStop, setEmergencyStop] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [riskMetrics, setRiskMetrics] = useState({
    dailyUsed: 0, dailyLimit: 100000, maxPerTrade: 20000, todayTrades: 0, todayPnL: 0
  });
  const [autoSettings, setAutoSettings] = useState({
    auto_exit: true, auto_entry: false, target_pct: 10, stoploss_pct: 25
  });
  const [showAutoSettings, setShowAutoSettings] = useState(false);
  const [marketIndices, setMarketIndices] = useState({
    nifty50: { value: 24125.50, change: 0, changePct: 0 },
    sensex: { value: 79850.25, change: 0, changePct: 0 },
    banknifty: { value: 52340.75, change: 0, changePct: 0 },
    finnifty: { value: 23890.30, change: 0, changePct: 0 }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [tradingMode, setTradingMode] = useState('PAPER');

  useEffect(() => {
    initializeApp();
    const dataInterval = setInterval(loadData, 30000);
    const exitInterval = setInterval(() => {
      if (autoSettings.auto_exit && !emergencyStop) checkAutoExits();
    }, 10000);
    const analysisInterval = setInterval(() => {
      if (autoAnalyze) fetchNewNews();
    }, 5 * 60 * 1000);
    const countdownInterval = setInterval(() => {
      if (autoAnalyze) {
        const now = Date.now();
        setNextAnalysis(Math.ceil((300000 - (now % 300000)) / 1000));
      }
    }, 1000);
    const marketInterval = setInterval(() => {
      setMarketIndices(prev => ({
        nifty50: { value: prev.nifty50.value + (Math.random() - 0.5) * 50, change: (Math.random() - 0.5) * 100, changePct: (Math.random() - 0.5) * 0.8 },
        sensex: { value: prev.sensex.value + (Math.random() - 0.5) * 150, change: (Math.random() - 0.5) * 300, changePct: (Math.random() - 0.5) * 0.8 },
        banknifty: { value: prev.banknifty.value + (Math.random() - 0.5) * 80, change: (Math.random() - 0.5) * 150, changePct: (Math.random() - 0.5) * 0.9 },
        finnifty: { value: prev.finnifty.value + (Math.random() - 0.5) * 40, change: (Math.random() - 0.5) * 80, changePct: (Math.random() - 0.5) * 0.7 }
      }));
    }, 3000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(exitInterval);
      clearInterval(analysisInterval);
      clearInterval(countdownInterval);
      clearInterval(marketInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyze, autoSettings.auto_exit, emergencyStop]);

  const initializeApp = async () => {
    try {
      await axios.post(`${API}/initialize`);
      await loadData();
      await loadAutoSettings();
    } catch (error) {
      console.error('Initialize error:', error);
    }
  };

  const loadAutoSettings = async () => {
    try {
      const response = await axios.get(`${API}/auto-settings`);
      if (response.data.status === 'success') setAutoSettings(response.data.settings);
    } catch (error) {
      console.error('Load auto settings error:', error);
    }
  };

  const updateAutoSettings = async (newSettings) => {
    try {
      const response = await axios.post(`${API}/auto-settings/update`, newSettings);
      if (response.data.status === 'success') {
        setAutoSettings(response.data.settings);
        addNotification('success', 'Auto-trading settings updated!');
      }
    } catch (error) {
      addNotification('error', 'Failed to update settings');
    }
  };

  const checkAutoExits = async () => {
    try {
      const response = await axios.post(`${API}/auto-exit/check`);
      if (response.data.exits_executed > 0) {
        addNotification('info', `${response.data.exits_executed} trade(s) auto-exited!`);
        if (response.data.new_trades_generated > 0) {
          addNotification('success', `${response.data.new_trades_generated} new trade(s) opened!`);
        } else if (autoSettings.auto_entry) {
          addNotification('warning', 'Auto-entry ON but no high-confidence signal found.');
        }
        await loadData();
      }
    } catch (error) {
      console.error('Check auto exits error:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [portfolioRes, newsRes, signalsRes, tradesRes, statsRes, todayRes, settingsRes] = await Promise.all([
        axios.get(`${API}/portfolio`),
        axios.get(`${API}/news/latest?limit=10`),
        axios.get(`${API}/signals/latest?limit=10`),
        axios.get(`${API}/trades/active`),
        axios.get(`${API}/stats`),
        axios.get(`${API}/trades/today`),
        axios.get(`${API}/settings`)
      ]);
      setPortfolio(portfolioRes.data);
      setNews(newsRes.data.news || []);
      setSignals(signalsRes.data.signals || []);
      setTrades(tradesRes.data.trades || []);
      setStats(statsRes.data.stats || {});
      if (settingsRes.data.status === 'success') {
        setTradingMode(settingsRes.data.settings.trading_mode || 'PAPER');
      }
      const todayData = todayRes.data;
      setRiskMetrics({
        dailyUsed: todayData.today_invested || 0,
        dailyLimit: 100000,
        maxPerTrade: 20000,
        todayTrades: todayData.total_trades_today || 0,
        todayPnL: todayData.today_pnl || 0
      });
    } catch (error) {
      console.error('Load data error:', error);
      addNotification('error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchNewNews = async () => {
    if (emergencyStop) {
      addNotification('warning', 'Trading stopped! Enable trading first.');
      return;
    }
    setFetchingNews(true);
    try {
      const response = await axios.get(`${API}/news/fetch`);
      const articles = response.data.articles || [];
      const highConfidence = articles.filter(a => a.sentiment_analysis?.confidence >= 80 && a.signal_generated);
      if (highConfidence.length > 0) {
        addNotification('success', `${highConfidence.length} high-confidence signal(s) generated!`);
      }
      addNotification('info', `Analyzed ${articles.length} news articles`);
      await loadData();
    } catch (error) {
      addNotification('error', 'Failed to fetch news');
    } finally {
      setFetchingNews(false);
    }
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

  const formatTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return 'N/A'; }
  };

  const formatCountdown = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const addNotification = (type, message) => {
    const id = Date.now();
    setNotifications(prev => [{ id, type, message, timestamp: new Date() }, ...prev].slice(0, 5));
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
  };

  const handleEmergencyStop = () => {
    setEmergencyStop(!emergencyStop);
    if (!emergencyStop) {
      addNotification('warning', 'Emergency Stop Activated! Trading paused.');
      setAutoAnalyze(false);
    } else {
      addNotification('success', 'Trading resumed!');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 text-gray-900">
      {/* Header */}
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
                </div>
              </div>
              {autoAnalyze && nextAnalysis && (
                <div className="ml-4 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium border border-green-300">
                  Auto-Analysis ON | Next: {formatCountdown(nextAnalysis)}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowSettings(true)} variant="outline" className="border-gray-300 hover:bg-gray-100 text-gray-700" data-testid="settings-button" title="Bot Settings">
                <FaCog />
              </Button>
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

      <div className="container mx-auto px-4 py-6">
        {/* LIVE Trading Warning */}
        {tradingMode === 'LIVE' && (
          <div className="bg-gradient-to-r from-red-600 to-orange-600 text-white p-4 rounded-lg mb-4 shadow-lg border-2 border-red-700 animate-pulse" data-testid="live-trading-warning">
            <div className="flex items-center gap-3">
              <div className="text-3xl">!</div>
              <div className="flex-1">
                <h3 className="font-bold text-lg">LIVE TRADING MODE ACTIVE</h3>
                <p className="text-sm">You are trading with REAL MONEY! All trades will be executed on Upstox.</p>
              </div>
              <Button onClick={() => setShowSettings(true)} className="bg-white text-red-600 hover:bg-gray-100">Settings</Button>
            </div>
          </div>
        )}

        <MarketTicker marketIndices={marketIndices} />

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="fixed top-20 right-4 z-50 space-y-2 max-w-md" data-testid="notifications-container">
            {notifications.map((notif) => (
              <div key={notif.id} className={`p-4 rounded-lg shadow-lg border-l-4 animate-slide-in ${
                notif.type === 'success' ? 'bg-green-50 border-green-500 text-green-800' :
                notif.type === 'error' ? 'bg-red-50 border-red-500 text-red-800' :
                notif.type === 'warning' ? 'bg-yellow-50 border-yellow-500 text-yellow-800' :
                'bg-blue-50 border-blue-500 text-blue-800'
              }`} data-testid={`notification-${notif.type}`}>
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{notif.message}</p>
                  <button onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))} className="ml-4 text-gray-500 hover:text-gray-700">x</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <RiskPanel riskMetrics={riskMetrics} emergencyStop={emergencyStop} onEmergencyStop={handleEmergencyStop} formatCurrency={formatCurrency} />

        <AutoTradingSettings autoSettings={autoSettings} showAutoSettings={showAutoSettings} setShowAutoSettings={setShowAutoSettings} updateAutoSettings={updateAutoSettings} />

        {/* Portfolio Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="portfolio-value-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Portfolio Value</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(portfolio?.current_value || 0)}</p>
              </div>
              <FaWallet className="text-3xl text-blue-500" />
            </div>
          </Card>
          <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="total-pnl-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Total P&L</p>
                <p className={`text-2xl font-bold ${(portfolio?.total_pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(portfolio?.total_pnl || 0)}
                </p>
              </div>
              <FaChartLine className="text-3xl text-green-500" />
            </div>
          </Card>
          <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="active-positions-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Active Positions</p>
                <p className="text-2xl font-bold text-gray-900">{portfolio?.active_positions || 0}</p>
              </div>
              <FaBullseye className="text-3xl text-purple-500" />
            </div>
          </Card>
          <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="win-rate-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Win Rate</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.win_rate?.toFixed(1) || 0}%</p>
              </div>
              <FaBullseye className="text-3xl text-yellow-500" />
            </div>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="news" className="space-y-4">
          <TabsList className="bg-white border-gray-200 shadow-sm">
            <TabsTrigger value="news" data-testid="news-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">News Feed</TabsTrigger>
            <TabsTrigger value="signals" data-testid="signals-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Signals</TabsTrigger>
            <TabsTrigger value="trades" data-testid="trades-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Active Trades</TabsTrigger>
            <TabsTrigger value="calculator" data-testid="calculator-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Calculator</TabsTrigger>
          </TabsList>

          <TabsContent value="news"><NewsFeed news={news} formatTime={formatTime} /></TabsContent>
          <TabsContent value="signals"><SignalsList signals={signals} formatCurrency={formatCurrency} formatTime={formatTime} /></TabsContent>
          <TabsContent value="trades"><TradesList trades={trades} formatCurrency={formatCurrency} formatTime={formatTime} /></TabsContent>
          <TabsContent value="calculator"><PositionCalculator riskMetrics={riskMetrics} formatCurrency={formatCurrency} /></TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white/80 backdrop-blur-sm mt-8 py-4 shadow-sm">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600">
          <p>Paper Trading Mode | AI-Powered Options Trading Bot | For Educational Purposes Only</p>
          <p className="text-xs mt-1 text-gray-500">Trading involves risk. Past performance does not guarantee future results.</p>
        </div>
      </footer>

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onSave={(settings) => {
            setShowSettings(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

export default App;
