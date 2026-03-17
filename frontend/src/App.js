import { useState, useEffect } from 'react';
import '@/App.css';
import axios from 'axios';
import { FaChartLine, FaNewspaper, FaBullseye, FaWallet, FaSync, FaRobot, FaCalculator, FaCog } from 'react-icons/fa';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SettingsPanel from '@/components/SettingsPanel';

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
    dailyUsed: 0,
    dailyLimit: 100000,
    maxPerTrade: 20000,
    todayTrades: 0,
    todayPnL: 0
  });
  const [autoSettings, setAutoSettings] = useState({
    auto_exit: true,
    auto_entry: false,
    target_pct: 10,
    stoploss_pct: 25
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
    
    // Auto refresh data every 30 seconds
    const dataInterval = setInterval(loadData, 30000);
    
    // Check auto-exits every 10 seconds if enabled
    const exitInterval = setInterval(() => {
      if (autoSettings.auto_exit && !emergencyStop) {
        checkAutoExits();
      }
    }, 10000);
    
    // Auto analyze news every 5 minutes if enabled
    const analysisInterval = setInterval(() => {
      if (autoAnalyze) {
        fetchNewNews();
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    // Update countdown timer
    const countdownInterval = setInterval(() => {
      if (autoAnalyze) {
        const now = Date.now();
        const nextTime = Math.ceil((300000 - (now % 300000)) / 1000); // seconds until next 5 min mark
        setNextAnalysis(nextTime);
      }
    }, 1000);
    
    // Update market indices every 3 seconds (simulate live prices)
    const marketInterval = setInterval(() => {
      setMarketIndices(prev => ({
        nifty50: {
          value: prev.nifty50.value + (Math.random() - 0.5) * 50,
          change: (Math.random() - 0.5) * 100,
          changePct: (Math.random() - 0.5) * 0.8
        },
        sensex: {
          value: prev.sensex.value + (Math.random() - 0.5) * 150,
          change: (Math.random() - 0.5) * 300,
          changePct: (Math.random() - 0.5) * 0.8
        },
        banknifty: {
          value: prev.banknifty.value + (Math.random() - 0.5) * 80,
          change: (Math.random() - 0.5) * 150,
          changePct: (Math.random() - 0.5) * 0.9
        },
        finnifty: {
          value: prev.finnifty.value + (Math.random() - 0.5) * 40,
          change: (Math.random() - 0.5) * 80,
          changePct: (Math.random() - 0.5) * 0.7
        }
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
      if (response.data.status === 'success') {
        setAutoSettings(response.data.settings);
      }
    } catch (error) {
      console.error('Load auto settings error:', error);
    }
  };

  const updateAutoSettings = async (newSettings) => {
    try {
      const response = await axios.post(`${API}/auto-settings/update`, newSettings);
      if (response.data.status === 'success') {
        setAutoSettings(response.data.settings);
        addNotification('success', '✅ Auto-trading settings updated!');
      }
    } catch (error) {
      console.error('Update settings error:', error);
      addNotification('error', '❌ Failed to update settings');
    }
  };

  const checkAutoExits = async () => {
    try {
      const response = await axios.post(`${API}/auto-exit/check`);
      if (response.data.exits_executed > 0) {
        const exitMsg = `🎯 ${response.data.exits_executed} trade(s) auto-exited!`;
        addNotification('info', exitMsg);
        
        if (response.data.new_trades_generated > 0) {
          addNotification('success', `🚀 ${response.data.new_trades_generated} new trade(s) opened!`);
        } else if (autoSettings.auto_entry) {
          // Auto-entry is ON but no new trade generated
          addNotification('warning', '⚠️ Auto-entry ON but no high-confidence signal found. Will try on next news cycle.');
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
      
      // Get trading mode from settings
      if (settingsRes.data.status === 'success') {
        setTradingMode(settingsRes.data.settings.trading_mode || 'PAPER');
      }
      
      // Calculate risk metrics with today's data
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
      addNotification('warning', '🛑 Trading stopped! Enable trading first.');
      return;
    }
    
    setFetchingNews(true);
    try {
      const response = await axios.get(`${API}/news/fetch`);
      console.log('News fetched:', response.data);
      
      // Check for high confidence signals
      const articles = response.data.articles || [];
      const highConfidence = articles.filter(a => 
        a.sentiment_analysis?.confidence >= 80 && a.signal_generated
      );
      
      if (highConfidence.length > 0) {
        addNotification('success', `🎯 ${highConfidence.length} high-confidence signal(s) generated!`);
      }
      
      addNotification('info', `📰 Analyzed ${articles.length} news articles`);
      await loadData(); // Reload all data
    } catch (error) {
      console.error('Fetch news error:', error);
      addNotification('error', '❌ Failed to fetch news');
    } finally {
      setFetchingNews(false);
    }
  };

  const getSentimentColor = (sentiment) => {
    if (!sentiment) return 'bg-gray-500';
    const s = sentiment.toUpperCase();
    if (s === 'BULLISH') return 'bg-green-500';
    if (s === 'BEARISH') return 'bg-red-500';
    return 'bg-yellow-500';
  };

  const getSentimentEmoji = (sentiment) => {
    if (!sentiment) return '📊';
    const s = sentiment.toUpperCase();
    if (s === 'BULLISH') return '🚀';
    if (s === 'BEARISH') return '📉';
    return '➡️';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleString('en-IN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  const formatCountdown = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const addNotification = (type, message) => {
    const id = Date.now();
    const notification = { id, type, message, timestamp: new Date() };
    setNotifications(prev => [notification, ...prev].slice(0, 5)); // Keep last 5
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const handleEmergencyStop = () => {
    setEmergencyStop(!emergencyStop);
    if (!emergencyStop) {
      addNotification('warning', '🛑 Emergency Stop Activated! Trading paused.');
      setAutoAnalyze(false);
    } else {
      addNotification('success', '✅ Trading resumed!');
    }
  };

  const calculatePositionSize = (confidence) => {
    const baseSize = riskMetrics.maxPerTrade;
    const confidenceMultiplier = confidence / 100;
    return Math.floor(baseSize * confidenceMultiplier);
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
                <h1 className="text-2xl font-bold text-gray-800">AI Trading Bot</h1>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-600">News-Based Options Trading</p>
                  <Badge className={tradingMode === 'LIVE' ? 'bg-red-600 animate-pulse' : 'bg-blue-600'}>
                    {tradingMode === 'LIVE' ? '🔴 LIVE TRADING' : '📝 PAPER MODE'}
                  </Badge>
                </div>
              </div>
              {autoAnalyze && nextAnalysis && (
                <div className="ml-4 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium border border-green-300">
                  🤖 Auto-Analysis ON • Next: {formatCountdown(nextAnalysis)}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowSettings(true)}
                variant="outline"
                className="border-gray-300 hover:bg-gray-100 text-gray-700"
                data-testid="settings-button"
                title="Bot Settings"
              >
                <FaCog />
              </Button>
              <Button
                onClick={() => setAutoAnalyze(!autoAnalyze)}
                variant={autoAnalyze ? "default" : "outline"}
                className={autoAnalyze 
                  ? "bg-green-600 hover:bg-green-700 text-white" 
                  : "border-gray-300 hover:bg-gray-100 text-gray-700"}
                data-testid="auto-analyze-toggle"
                title={autoAnalyze ? "Disable Auto-Analysis" : "Enable Auto-Analysis"}
              >
                {autoAnalyze ? '✅ Auto ON' : '⏸️ Auto OFF'}
              </Button>
              <Button
                onClick={loadData}
                disabled={loading}
                variant="outline"
                className="border-gray-300 hover:bg-gray-100 text-gray-700"
                data-testid="refresh-button"
              >
                <FaSync className={loading ? 'animate-spin' : ''} />
              </Button>
              <Button
                onClick={fetchNewNews}
                disabled={fetchingNews}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                data-testid="fetch-news-button"
              >
                {fetchingNews ? 'Fetching...' : 'Analyze Now'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* LIVE Trading Warning Banner */}
        {tradingMode === 'LIVE' && (
          <div className="bg-gradient-to-r from-red-600 to-orange-600 text-white p-4 rounded-lg mb-4 shadow-lg border-2 border-red-700 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="text-3xl">⚠️</div>
              <div className="flex-1">
                <h3 className="font-bold text-lg">🔴 LIVE TRADING MODE ACTIVE</h3>
                <p className="text-sm">You are trading with REAL MONEY! All trades will be executed on Upstox. Be careful!</p>
              </div>
              <Button
                onClick={() => setShowSettings(true)}
                className="bg-white text-red-600 hover:bg-gray-100"
              >
                ⚙️ Settings
              </Button>
            </div>
          </div>
        )}

        {/* Live Market Indices Ticker */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-md p-3 mb-4 overflow-hidden" data-testid="market-ticker">
          <div className="flex items-center gap-6 overflow-x-auto">
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm font-semibold text-gray-600">📊 LIVE MARKET:</span>
            </div>
            
            {/* Nifty 50 */}
            <div className="flex items-center gap-2 border-l border-gray-300 pl-4 flex-shrink-0">
              <div>
                <p className="text-xs text-gray-600 font-medium">NIFTY 50</p>
                <p className="text-sm font-bold text-gray-900">{marketIndices.nifty50.value.toFixed(2)}</p>
              </div>
              <div className={`text-xs font-semibold ${marketIndices.nifty50.changePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {marketIndices.nifty50.changePct >= 0 ? '▲' : '▼'} {Math.abs(marketIndices.nifty50.changePct).toFixed(2)}%
              </div>
            </div>
            
            {/* Sensex */}
            <div className="flex items-center gap-2 border-l border-gray-300 pl-4 flex-shrink-0">
              <div>
                <p className="text-xs text-gray-600 font-medium">SENSEX</p>
                <p className="text-sm font-bold text-gray-900">{marketIndices.sensex.value.toFixed(2)}</p>
              </div>
              <div className={`text-xs font-semibold ${marketIndices.sensex.changePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {marketIndices.sensex.changePct >= 0 ? '▲' : '▼'} {Math.abs(marketIndices.sensex.changePct).toFixed(2)}%
              </div>
            </div>
            
            {/* Bank Nifty */}
            <div className="flex items-center gap-2 border-l border-gray-300 pl-4 flex-shrink-0">
              <div>
                <p className="text-xs text-gray-600 font-medium">BANK NIFTY</p>
                <p className="text-sm font-bold text-gray-900">{marketIndices.banknifty.value.toFixed(2)}</p>
              </div>
              <div className={`text-xs font-semibold ${marketIndices.banknifty.changePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {marketIndices.banknifty.changePct >= 0 ? '▲' : '▼'} {Math.abs(marketIndices.banknifty.changePct).toFixed(2)}%
              </div>
            </div>
            
            {/* Fin Nifty */}
            <div className="flex items-center gap-2 border-l border-gray-300 pl-4 flex-shrink-0">
              <div>
                <p className="text-xs text-gray-600 font-medium">FIN NIFTY</p>
                <p className="text-sm font-bold text-gray-900">{marketIndices.finnifty.value.toFixed(2)}</p>
              </div>
              <div className={`text-xs font-semibold ${marketIndices.finnifty.changePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {marketIndices.finnifty.changePct >= 0 ? '▲' : '▼'} {Math.abs(marketIndices.finnifty.changePct).toFixed(2)}%
              </div>
            </div>
            
            <div className="flex items-center gap-2 border-l border-gray-300 pl-4 flex-shrink-0">
              <span className="text-xs text-gray-500 italic">Updating every 3 sec</span>
            </div>
          </div>
        </div>

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="fixed top-20 right-4 z-50 space-y-2 max-w-md" data-testid="notifications-container">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`p-4 rounded-lg shadow-lg border-l-4 animate-slide-in ${
                  notif.type === 'success' ? 'bg-green-50 border-green-500 text-green-800' :
                  notif.type === 'error' ? 'bg-red-50 border-red-500 text-red-800' :
                  notif.type === 'warning' ? 'bg-yellow-50 border-yellow-500 text-yellow-800' :
                  'bg-blue-50 border-blue-500 text-blue-800'
                }`}
                data-testid={`notification-${notif.type}`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{notif.message}</p>
                  <button
                    onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                    className="ml-4 text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Risk Management Panel */}
        <Card className="bg-gradient-to-r from-orange-50 to-red-50 border-orange-200 p-4 mb-4 shadow-lg" data-testid="risk-management-panel">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                ⚙️ Risk Management
                {emergencyStop && <Badge className="bg-red-600">🛑 STOPPED</Badge>}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <p className="text-xs text-gray-600 font-medium">Daily Used</p>
                  <p className="text-lg font-bold text-gray-900">{formatCurrency(riskMetrics.dailyUsed)}</p>
                  <p className="text-xs text-gray-500">of {formatCurrency(riskMetrics.dailyLimit)}</p>
                  <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${riskMetrics.dailyUsed / riskMetrics.dailyLimit > 0.8 ? 'bg-red-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min((riskMetrics.dailyUsed / riskMetrics.dailyLimit) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium">Max Per Trade</p>
                  <p className="text-lg font-bold text-gray-900">{formatCurrency(riskMetrics.maxPerTrade)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium">Today's Trades</p>
                  <p className="text-lg font-bold text-gray-900">{riskMetrics.todayTrades}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium">Today's P&L</p>
                  <p className={`text-lg font-bold ${riskMetrics.todayPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(riskMetrics.todayPnL)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium">Stop Loss</p>
                  <p className="text-lg font-bold text-orange-600">25%</p>
                  <p className="text-xs text-gray-500">Medium Risk</p>
                </div>
              </div>
            </div>
            <div className="ml-6">
              <Button
                onClick={handleEmergencyStop}
                className={emergencyStop 
                  ? "bg-green-600 hover:bg-green-700 text-white text-lg px-6 py-6 shadow-xl" 
                  : "bg-red-600 hover:bg-red-700 text-white text-lg px-6 py-6 shadow-xl animate-pulse"}
                data-testid="emergency-stop-button"
              >
                {emergencyStop ? '▶️ Resume' : '🛑 STOP'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Auto-Trading Settings - Collapsible */}
        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 p-4 mb-6 shadow-lg" data-testid="auto-trading-settings">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowAutoSettings(!showAutoSettings)}
          >
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              🤖 Auto-Trading Settings
              <Badge className="bg-blue-600 text-xs">
                Exit: {autoSettings.auto_exit ? 'ON' : 'OFF'} | Entry: {autoSettings.auto_entry ? 'ON' : 'OFF'}
              </Badge>
            </h2>
            <Button variant="ghost" className="text-gray-600">
              {showAutoSettings ? '▲ Hide' : '▼ Show'}
            </Button>
          </div>
          
          {showAutoSettings && (
            <div className="mt-4 grid md:grid-cols-2 gap-6 animate-slide-in">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                  <div>
                    <p className="font-semibold text-gray-800">Auto-Exit</p>
                    <p className="text-xs text-gray-600">Automatically close trades at target/stop-loss</p>
                  </div>
                  <Button
                    onClick={() => updateAutoSettings({ ...autoSettings, auto_exit: !autoSettings.auto_exit })}
                    className={autoSettings.auto_exit ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 hover:bg-gray-500'}
                    data-testid="auto-exit-toggle"
                  >
                    {autoSettings.auto_exit ? '✅ ON' : '⏸️ OFF'}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                  <div>
                    <p className="font-semibold text-gray-800">Auto-Entry</p>
                    <p className="text-xs text-gray-600">Open new trade after profitable exit</p>
                  </div>
                  <Button
                    onClick={() => updateAutoSettings({ ...autoSettings, auto_entry: !autoSettings.auto_entry })}
                    className={autoSettings.auto_entry ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 hover:bg-gray-500'}
                    data-testid="auto-entry-toggle"
                  >
                    {autoSettings.auto_entry ? '✅ ON' : '⏸️ OFF'}
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-3 bg-white rounded-lg border border-gray-200">
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Target Profit (%)
                  </label>
                  <input
                    type="number"
                    value={autoSettings.target_pct || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val >= 5 && val <= 100) {
                        updateAutoSettings({ ...autoSettings, target_pct: val });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 10"
                    min="5"
                    max="100"
                  />
                  <p className="text-xs text-gray-500 mt-1">Trade will close at this profit %</p>
                </div>

                <div className="p-3 bg-white rounded-lg border border-gray-200">
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Stop Loss (%)
                  </label>
                  <input
                    type="number"
                    value={autoSettings.stoploss_pct || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val >= 5 && val <= 50) {
                        updateAutoSettings({ ...autoSettings, stoploss_pct: val });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 25"
                    min="5"
                    max="50"
                  />
                  <p className="text-xs text-gray-500 mt-1">Trade will close at this loss %</p>
                </div>
              </div>

              <div className="md:col-span-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-sm text-gray-700">
                  <strong>💡 How it works:</strong> When auto-exit is ON, trades automatically close when they hit your target profit ({autoSettings.target_pct}%) or stop-loss ({autoSettings.stoploss_pct}%). 
                  {autoSettings.auto_entry && ' With auto-entry ON, a new trade will open automatically after a profitable exit.'}
                </p>
              </div>
            </div>
          )}
        </Card>

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
            <TabsTrigger value="news" data-testid="news-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">📰 News Feed</TabsTrigger>
            <TabsTrigger value="signals" data-testid="signals-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">🎯 Signals</TabsTrigger>
            <TabsTrigger value="trades" data-testid="trades-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">💹 Active Trades</TabsTrigger>
            <TabsTrigger value="calculator" data-testid="calculator-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">🧮 Calculator</TabsTrigger>
          </TabsList>

          {/* News Feed Tab */}
          <TabsContent value="news" className="space-y-4">
            {news.length === 0 ? (
              <Card className="bg-white border-gray-200 p-8 text-center shadow-md" data-testid="no-news-message">
                <FaNewspaper className="text-5xl text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">No news analyzed yet</p>
                <p className="text-sm text-gray-500 mt-2">Click "Analyze News" to fetch latest market news</p>
              </Card>
            ) : (
              news.map((article, idx) => (
                <Card key={idx} className="bg-white border-gray-200 p-4 hover:shadow-lg transition-all" data-testid={`news-article-${idx}`}>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0">
                      <div className={`w-16 h-16 rounded-lg ${getSentimentColor(article.sentiment_analysis?.sentiment)} flex items-center justify-center text-3xl shadow-md`}>
                        {getSentimentEmoji(article.sentiment_analysis?.sentiment)}
                      </div>
                    </div>
                    <div className="flex-grow">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-lg text-gray-800">{article.title}</h3>
                        <Badge className={getSentimentColor(article.sentiment_analysis?.sentiment)}>
                          {article.sentiment_analysis?.sentiment || 'N/A'}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{article.description}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>📰 {article.source}</span>
                        <span>🕒 {formatTime(article.published_at)}</span>
                        {article.sentiment_analysis && (
                          <>
                            <span>💯 Confidence: {article.sentiment_analysis.confidence}%</span>
                            <span>📊 {article.sentiment_analysis.impact} Impact</span>
                          </>
                        )}
                      </div>
                      {article.sentiment_analysis?.reason && (
                        <p className="text-sm text-blue-600 mt-2 italic bg-blue-50 p-2 rounded">💡 {article.sentiment_analysis.reason}</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Signals Tab */}
          <TabsContent value="signals" className="space-y-4">
            {signals.length === 0 ? (
              <Card className="bg-white border-gray-200 p-8 text-center shadow-md" data-testid="no-signals-message">
                <FaBullseye className="text-5xl text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">No trading signals generated yet</p>
              </Card>
            ) : (
              signals.map((signal, idx) => (
                <Card key={idx} className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid={`signal-${idx}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Badge className={signal.signal_type === 'CALL' ? 'bg-green-600' : 'bg-red-600'}>
                        {signal.signal_type === 'CALL' ? '🚀 CALL' : '📉 PUT'}
                      </Badge>
                      <span className="font-semibold text-lg text-gray-800">{signal.symbol}</span>
                      <Badge variant="outline" className="border-gray-400 text-gray-700">Strike: {signal.strike_price}</Badge>
                    </div>
                    <Badge className={getSentimentColor(signal.sentiment)}>
                      {signal.confidence}% Confident
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600 font-medium">Entry Price</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(signal.entry_price)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Target</p>
                      <p className="font-semibold text-green-600">{formatCurrency(signal.target)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Stop Loss</p>
                      <p className="font-semibold text-red-600">{formatCurrency(signal.stop_loss)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Investment</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(signal.investment_amount)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mt-3 italic bg-gray-50 p-2 rounded">💡 {signal.reason}</p>
                  <p className="text-xs text-gray-500 mt-2">🕒 Generated: {formatTime(signal.created_at)}</p>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Active Trades Tab */}
          <TabsContent value="trades" className="space-y-4">
            {trades.length === 0 ? (
              <Card className="bg-white border-gray-200 p-8 text-center shadow-md" data-testid="no-trades-message">
                <FaChartLine className="text-5xl text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">No active trades</p>
              </Card>
            ) : (
              trades.map((trade, idx) => (
                <Card key={idx} className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid={`trade-${idx}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Badge className={trade.trade_type === 'CALL' ? 'bg-green-600' : 'bg-red-600'}>
                        {trade.trade_type}
                      </Badge>
                      <span className="font-semibold text-lg text-gray-800">{trade.symbol}</span>
                      <Badge variant="outline" className="border-gray-400 text-gray-700">Qty: {trade.quantity}</Badge>
                    </div>
                    <Badge className="bg-blue-600">{trade.status}</Badge>
                  </div>
                  
                  {/* Live P&L Section */}
                  {trade.current_price && (
                    <div className={`p-3 rounded-lg mb-3 border-2 ${
                      trade.live_pnl >= 0 
                        ? 'bg-green-50 border-green-300' 
                        : 'bg-red-50 border-red-300'
                    }`}>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <p className="text-xs text-gray-600 font-medium">Current Price</p>
                          <p className="text-lg font-bold text-gray-900">{formatCurrency(trade.current_price)}</p>
                          <p className="text-xs text-gray-500">Entry: {formatCurrency(trade.entry_price)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 font-medium">Current Value</p>
                          <p className="text-lg font-bold text-gray-900">{formatCurrency(trade.current_value)}</p>
                          <p className="text-xs text-gray-500">Invested: {formatCurrency(trade.investment)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 font-medium">Live P&L</p>
                          <p className={`text-2xl font-bold ${trade.live_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {trade.live_pnl >= 0 ? '+' : ''}{formatCurrency(trade.live_pnl)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 font-medium">P&L %</p>
                          <p className={`text-2xl font-bold ${trade.pnl_percentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {trade.pnl_percentage >= 0 ? '+' : ''}{trade.pnl_percentage.toFixed(2)}%
                          </p>
                        </div>
                      </div>
                      
                      {/* Progress to Target/Stop Loss */}
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span className="text-red-600 font-medium">SL: {formatCurrency(trade.stop_loss)}</span>
                          <span className={`font-bold ${trade.live_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {trade.live_pnl >= 0 ? '📈 In Profit' : '📉 In Loss'}
                          </span>
                          <span className="text-green-600 font-medium">Target: {formatCurrency(trade.target)}</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden relative">
                          {/* Stop Loss Marker */}
                          <div className="absolute left-0 top-0 bottom-0 w-px bg-red-500" />
                          {/* Current Position */}
                          <div 
                            className={`h-full ${trade.live_pnl >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ 
                              width: `${Math.min(Math.max(((trade.current_price - trade.stop_loss) / (trade.target - trade.stop_loss)) * 100, 0), 100)}%` 
                            }}
                          />
                          {/* Target Marker */}
                          <div className="absolute right-0 top-0 bottom-0 w-px bg-green-500" />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600 font-medium">Entry</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(trade.entry_price)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Target</p>
                      <p className="font-semibold text-green-600">{formatCurrency(trade.target)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Stop Loss</p>
                      <p className="font-semibold text-red-600">{formatCurrency(trade.stop_loss)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Investment</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(trade.investment)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">🕒 Entry: {formatTime(trade.entry_time)}</p>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Position Size Calculator Tab */}
          <TabsContent value="calculator" className="space-y-4">
            <Card className="bg-white border-gray-200 p-6 shadow-md" data-testid="position-calculator">
              <div className="flex items-center gap-3 mb-6">
                <FaCalculator className="text-3xl text-blue-600" />
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Position Size Calculator</h2>
                  <p className="text-sm text-gray-600">Calculate optimal position size based on confidence</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Signal Confidence (%)
                    </label>
                    <input
                      type="range"
                      min="60"
                      max="100"
                      defaultValue="80"
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      onChange={(e) => {
                        const conf = parseInt(e.target.value);
                        document.getElementById('conf-value').textContent = conf;
                        document.getElementById('calc-size').textContent = formatCurrency(calculatePositionSize(conf));
                      }}
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>60%</span>
                      <span id="conf-value" className="font-bold text-blue-600">80%</span>
                      <span>100%</span>
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <p className="text-sm text-gray-600 mb-1">Calculated Position Size</p>
                    <p id="calc-size" className="text-3xl font-bold text-blue-600">
                      {formatCurrency(calculatePositionSize(80))}
                    </p>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-semibold text-gray-800 mb-3">Risk Parameters</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Max Per Trade:</span>
                        <span className="font-semibold">{formatCurrency(riskMetrics.maxPerTrade)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Stop Loss:</span>
                        <span className="font-semibold text-red-600">25%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Target Profit:</span>
                        <span className="font-semibold text-green-600">50%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Risk/Reward:</span>
                        <span className="font-semibold">1:2</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-green-50 to-blue-50 p-4 rounded-lg border border-green-200">
                    <h3 className="font-semibold text-gray-800 mb-3">💡 Position Sizing Logic</h3>
                    <ul className="space-y-2 text-sm text-gray-700">
                      <li className="flex items-start gap-2">
                        <span className="text-green-600">✓</span>
                        <span><strong>High Confidence (80-100%):</strong> Full position size up to ₹20,000</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-600">⚠</span>
                        <span><strong>Medium Confidence (60-79%):</strong> Reduced position size</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-600">✕</span>
                        <span><strong>Low Confidence (&lt;60%):</strong> No trade executed</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                    <h3 className="font-semibold text-gray-800 mb-3">⚠️ Risk Warnings</h3>
                    <ul className="space-y-2 text-sm text-gray-700">
                      <li className="flex items-start gap-2">
                        <span>•</span>
                        <span>Daily limit: {formatCurrency(riskMetrics.dailyLimit)}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span>•</span>
                        <span>Daily used: {formatCurrency(riskMetrics.dailyUsed)} ({((riskMetrics.dailyUsed / riskMetrics.dailyLimit) * 100).toFixed(1)}%)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span>•</span>
                        <span>Remaining: {formatCurrency(riskMetrics.dailyLimit - riskMetrics.dailyUsed)}</span>
                      </li>
                      {riskMetrics.dailyUsed / riskMetrics.dailyLimit > 0.8 && (
                        <li className="flex items-start gap-2 text-red-600 font-semibold">
                          <span>⚠️</span>
                          <span>WARNING: 80% of daily limit reached!</span>
                        </li>
                      )}
                    </ul>
                  </div>

                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <h3 className="font-semibold text-gray-800 mb-2">📊 Today's Summary</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-600">Trades</p>
                        <p className="text-xl font-bold text-gray-900">{riskMetrics.todayTrades}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">P&L</p>
                        <p className={`text-xl font-bold ${riskMetrics.todayPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(riskMetrics.todayPnL)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white/80 backdrop-blur-sm mt-8 py-4 shadow-sm">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600">
          <p>⚠️ Paper Trading Mode • AI-Powered Options Trading Bot • For Educational Purposes Only</p>
          <p className="text-xs mt-1 text-gray-500">Trading involves risk. Past performance does not guarantee future results.</p>
        </div>
      </footer>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsPanel 
          onClose={() => setShowSettings(false)}
          onSave={(settings) => {
            console.log('Settings saved:', settings);
            setShowSettings(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

export default App;
