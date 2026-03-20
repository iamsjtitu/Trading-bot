import { useState, useEffect, useCallback, useRef } from 'react';
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
import TradeHistory from '@/components/TradeHistory';
import TradeAnalytics from '@/components/TradeAnalytics';
import TaxReports from '@/components/TaxReports';
import AIInsights from '@/components/AIInsights';
import TechnicalAnalysis from '@/components/TechnicalAnalysis';
import OptionChain from '@/components/OptionChain';
import TradeJournal from '@/components/TradeJournal';
import UpdateBanner from '@/components/UpdateBanner';
import MarketStatusBanner from '@/components/MarketStatusBanner';
import AIGuards from '@/components/AIGuards';

// Detect if running in desktop (localhost) or web mode
const BACKEND_URL = (() => {
  const envUrl = process.env.REACT_APP_BACKEND_URL || '';
  // In desktop/Electron: use relative URLs (same server)
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return '';
  }
  return envUrl;
})();
const API = `${BACKEND_URL}/api`;

// Build WebSocket URL from the backend URL
const WS_URL = (() => {
  const base = BACKEND_URL || window.location.origin;
  return base.replace(/^http/, 'ws') + '/api/ws/market-data';
})();

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
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [brokerProfile, setBrokerProfile] = useState(null);
  const [livePortfolio, setLivePortfolio] = useState(null);
  const [brokerOrders, setBrokerOrders] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  const [activeTab, setActiveTab] = useState('news');

  // Ultra-fast market data polling for LIVE mode (500ms)
  const loadMarketDataQuick = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/market-data/quick`);
      if (res.data.status === 'success' && res.data.data) {
        setMarketIndices(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(res.data.data).map(([k, v]) => [k, {
              value: v.value || prev[k]?.value || 0,
              change: v.change || 0,
              changePct: v.changePct || 0,
            }])
          ),
        }));
      }
    } catch (_) {}
  }, []);

  const addNotification = useCallback((type, message) => {
    const id = Date.now();
    setNotifications(prev => [{ id, type, message, timestamp: new Date() }, ...prev].slice(0, 5));
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
  }, []);

  const handleManualExit = useCallback(async (trade) => {
    try {
      const res = await axios.post(`${API}/trades/manual-exit`, {
        instrument_token: trade.instrument_token,
        trade_id: trade.id,
      });
      if (res.data.status === 'success') {
        addNotification('success', res.data.message || 'Position closed successfully');
        // Refresh trades
        const tradesRes = await axios.get(`${API}/trades/active`);
        setTrades(tradesRes.data.trades || []);
      } else {
        addNotification('error', res.data.message || 'Exit failed');
      }
    } catch (err) {
      addNotification('error', `Exit error: ${err.message}`);
    }
  }, [addNotification]);

  const loadUpstoxData = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/combined-status`);
      const data = res.data;

      setBrokerConnected(data.upstox_connected || false);

      if (data.upstox_connected) {
        if (data.market_data) setMarketIndices(data.market_data);
        if (data.portfolio) setLivePortfolio(data.portfolio);
        if (data.orders) setBrokerOrders(data.orders);
        if (data.profile) setBrokerProfile(data.profile);

        // Update risk metrics from Upstox live data
        if (data.portfolio) {
          const lp = data.portfolio;
          const completedOrders = data.orders || [];
          const riskSettings = {};
          try {
            const setRes = await axios.get(`${API}/settings`);
            Object.assign(riskSettings, setRes.data?.settings?.risk || {});
          } catch (_) {}
          // Fetch today's actual P&L (realized + unrealized)
          let todayPnlVal = 0;
          try {
            const todayRes = await axios.get(`${API}/trades/today`);
            todayPnlVal = todayRes.data?.today_pnl || 0;
          } catch (_) {
            todayPnlVal = lp.total_pnl || 0;
          }
          setRiskMetrics({
            dailyUsed: lp.funds?.used_margin || 0,
            dailyLimit: (lp.funds?.total || 0) > 0 ? lp.funds.total : riskSettings.daily_limit || 100000,
            maxPerTrade: riskSettings.max_per_trade || 20000,
            todayTrades: completedOrders.length,
            todayPnL: todayPnlVal,
            isLive: true,
          });
        }
      } else {
        // Upstox not connected - fallback to paper data for Risk Panel
        try {
          const todayRes = await axios.get(`${API}/trades/today`);
          const todayData = todayRes.data;
          setRiskMetrics({
            dailyUsed: todayData.today_invested || 0,
            dailyLimit: 100000,
            maxPerTrade: 20000,
            todayTrades: todayData.total_trades_today || 0,
            todayPnL: todayData.today_pnl || 0,
            isLive: false,
          });
        } catch (_) {}
      }
    } catch (e) {
      console.error('Upstox data error:', e);
    }
  }, []);

  const loadData = useCallback(async () => {
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

      const mode = settingsRes.data?.settings?.trading_mode || 'PAPER';
      setTradingMode(mode);
      // Restore emergency stop state from backend
      if (settingsRes.data?.settings?.emergency_stop) {
        setEmergencyStop(true);
      }

      // Only set risk metrics from paper data if NOT in LIVE mode
      // In LIVE mode, loadUpstoxData() will set live risk metrics
      if (mode !== 'LIVE') {
        const todayData = todayRes.data;
        const riskCfg = settingsRes.data?.settings?.risk || {};
        // Calculate today's P&L: realized (from closed trades) + unrealized (from active trades' live_pnl)
        const activeTrades = tradesRes.data.trades || [];
        const liveUnrealized = activeTrades.reduce((sum, t) => sum + (t.live_pnl || 0), 0);
        const todayPnL = Math.round(((todayData.realized_pnl || 0) + liveUnrealized) * 100) / 100;
        setRiskMetrics({
          dailyUsed: todayData.today_invested || 0,
          dailyLimit: riskCfg.daily_limit || 100000,
          maxPerTrade: riskCfg.max_per_trade || 20000,
          todayTrades: todayData.total_trades_today || 0,
          todayPnL: todayPnL,
          isLive: false,
        });
      }

      // If LIVE mode, fetch Upstox data (this will set live risk metrics)
      if (mode === 'LIVE') {
        await loadUpstoxData();
      }
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
    }
  }, [loadUpstoxData]);

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

  const checkAutoExits = useCallback(async () => {
    try {
      const response = await axios.post(`${API}/auto-exit/check`);
      if (response.data.exits_executed > 0) {
        addNotification('info', `${response.data.exits_executed} trade(s) auto-exited!`);
        if (response.data.new_trades_generated > 0) {
          addNotification('success', `${response.data.new_trades_generated} new trade(s) opened!`);
        }
        await loadData();
      }
    } catch (error) {
      console.error('Check auto exits error:', error);
    }
  }, [addNotification, loadData]);

  const fetchNewNews = useCallback(async () => {
    if (emergencyStop) {
      addNotification('warning', 'Trading stopped! Enable trading first.');
      return;
    }
    setFetchingNews(true);
    try {
      const response = await axios.get(`${API}/news/fetch`);
      const articles = response.data.articles || [];
      const highConfidence = articles.filter(a => a.sentiment_analysis?.confidence >= 80 && a.signal_generated);
      if (highConfidence.length > 0) addNotification('success', `${highConfidence.length} high-confidence signal(s)!`);
      addNotification('info', `Analyzed ${articles.length} news articles`);
      await loadData();
    } catch (error) {
      addNotification('error', 'Failed to fetch news');
    } finally {
      setFetchingNews(false);
    }
  }, [emergencyStop, addNotification, loadData]);

  useEffect(() => {
    const init = async () => {
      try {
        await axios.post(`${API}/initialize`);
        await loadData();
        await loadAutoSettings();
        // Load auto-analysis state from settings
        try {
          const settingsRes = await axios.get(`${API}/settings`);
          const autoAnalysis = settingsRes.data?.settings?.auto_trading?.auto_analysis;
          if (typeof autoAnalysis === 'boolean') setAutoAnalyze(autoAnalysis);
        } catch (_) {}
      } catch (error) {
        console.error('Initialize error:', error);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

  // Auto square-off check near market close (3:15 PM IST)
  const checkSquareOff = useCallback(async () => {
    const now = new Date();
    const istOffset = 5.5 * 60;
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const istMinutes = (utcMinutes + istOffset) % 1440;
    // Trigger between 3:15 PM (915 min) and 3:25 PM (925 min) IST
    if (istMinutes >= 915 && istMinutes <= 925) {
      try {
        const res = await axios.post(`${API}/market/square-off-check`);
        if (res.data?.open_count > 0) {
          addNotification('warning', `Square-off warning: ${res.data.open_count} position(s) open near market close!`);
        }
      } catch (_) {}
    }
  }, [addNotification]);

  useEffect(() => {
    const dataInterval = setInterval(loadData, 30000);
    const exitInterval = setInterval(() => {
      if (autoSettings.auto_exit && !emergencyStop) checkAutoExits();
    }, 10000);

    // Auto news fetch: run when autoAnalyze is ON OR when auto_entry is ON (entry needs fresh signals)
    const shouldAutoFetch = autoAnalyze || autoSettings.auto_entry;
    const analysisInterval = setInterval(() => {
      if (shouldAutoFetch && !emergencyStop) fetchNewNews();
    }, 3 * 60 * 1000); // Every 3 minutes for faster signal generation

    // Immediate first news fetch when auto-entry turns ON
    if (autoSettings.auto_entry && !emergencyStop) {
      fetchNewNews();
    }

    const countdownInterval = setInterval(() => {
      if (shouldAutoFetch) setNextAnalysis(Math.ceil((180000 - (Date.now() % 180000)) / 1000));
    }, 1000);
    const squareOffInterval = setInterval(checkSquareOff, 60000);

    return () => {
      clearInterval(dataInterval);
      clearInterval(exitInterval);
      clearInterval(analysisInterval);
      clearInterval(countdownInterval);
      clearInterval(squareOffInterval);
    };
  }, [autoAnalyze, autoSettings.auto_exit, autoSettings.auto_entry, emergencyStop, checkAutoExits, fetchNewNews, loadData, checkSquareOff]);

  // SEPARATE useEffect for ultra-fast market data polling (500ms)
  // This MUST be isolated so other state changes don't kill the interval
  useEffect(() => {
    let marketInterval;
    if (tradingMode === 'LIVE' && brokerConnected) {
      // Immediate first load
      loadMarketDataQuick();
      // Then poll every 500ms for near real-time
      marketInterval = setInterval(loadMarketDataQuick, 500);
    } else if (tradingMode !== 'LIVE') {
      // Only simulate in PAPER mode
      marketInterval = setInterval(() => {
        setMarketIndices(prev => ({
          nifty50: { value: prev.nifty50.value + (Math.random() - 0.5) * 50, change: (Math.random() - 0.5) * 100, changePct: (Math.random() - 0.5) * 0.8 },
          sensex: { value: prev.sensex.value + (Math.random() - 0.5) * 150, change: (Math.random() - 0.5) * 300, changePct: (Math.random() - 0.5) * 0.8 },
          banknifty: { value: prev.banknifty.value + (Math.random() - 0.5) * 80, change: (Math.random() - 0.5) * 150, changePct: (Math.random() - 0.5) * 0.9 },
          finnifty: { value: prev.finnifty.value + (Math.random() - 0.5) * 40, change: (Math.random() - 0.5) * 80, changePct: (Math.random() - 0.5) * 0.7 }
        }));
      }, 1000);
    }
    return () => { if (marketInterval) clearInterval(marketInterval); };
  }, [tradingMode, brokerConnected, loadMarketDataQuick]);

  // 1-SECOND AUTO-REFRESH for Active Trades (live P&L)
  // Only polls when "trades" tab is active - saves resources
  useEffect(() => {
    let tradeInterval;
    if (activeTab === 'trades') {
      const fetchActiveTrades = async () => {
        try {
          const [tradeRes, todayRes] = await Promise.all([
            axios.get(`${API}/trades/active`),
            axios.get(`${API}/trades/today`),
          ]);
          if (tradeRes.data?.trades) {
            setTrades(tradeRes.data.trades);
            // Calculate real-time today's P&L: realized (closed trades) + live unrealized (open trades)
            const activeTrades = tradeRes.data.trades;
            const liveUnrealized = activeTrades.reduce((sum, t) => sum + (t.live_pnl || 0), 0);
            const realizedPnl = todayRes.data?.realized_pnl || 0;
            const totalTodayPnl = Math.round((realizedPnl + liveUnrealized) * 100) / 100;
            setRiskMetrics(prev => ({ ...prev, todayPnL: totalTodayPnl }));
          } else if (todayRes.data?.today_pnl != null) {
            setRiskMetrics(prev => ({ ...prev, todayPnL: todayRes.data.today_pnl }));
          }
        } catch (_) {}
      };
      fetchActiveTrades(); // Immediate first load
      tradeInterval = setInterval(fetchActiveTrades, 1000);
    }
    return () => { if (tradeInterval) clearInterval(tradeInterval); };
  }, [activeTab]);

  // WebSocket connection for real-time market data
  useEffect(() => {
    if (tradingMode !== 'LIVE' || !brokerConnected) {
      // Disconnect WS when not in LIVE or Upstox not connected
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setWsConnected(false);
      }
      return;
    }

    let ws;
    let reconnectTimer;
    let pingTimer;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          addNotification('success', 'Real-time WebSocket connected');
          // Start ping keepalive
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ action: 'ping' }));
            }
          }, 25000);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'market_data' && msg.data) {
              setMarketIndices(prev => ({
                ...prev,
                ...Object.fromEntries(
                  Object.entries(msg.data).map(([k, v]) => [k, {
                    value: v.value || prev[k]?.value || 0,
                    change: v.change || 0,
                    changePct: v.changePct || 0,
                  }])
                ),
              }));
            }
          } catch (_) {}
        };

        ws.onclose = () => {
          setWsConnected(false);
          wsRef.current = null;
          if (pingTimer) clearInterval(pingTimer);
          // Auto-reconnect after 5s
          reconnectTimer = setTimeout(connect, 5000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (e) {
        console.error('WS connect error:', e);
        reconnectTimer = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      if (ws) ws.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [tradingMode, brokerConnected, addNotification]);

  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  const formatTime = (isoString) => {
    if (!isoString) return 'N/A';
    try { return new Date(isoString).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return 'N/A'; }
  };
  const formatCountdown = (seconds) => {
    if (!seconds) return '0:00';
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const handleEmergencyStop = async () => {
    const newState = !emergencyStop;
    setEmergencyStop(newState);
    if (newState) {
      addNotification('warning', 'Emergency Stop Activated! All trading halted.');
      setAutoAnalyze(false);
    } else {
      addNotification('success', 'Trading resumed!');
    }
    // Persist to backend so auto-exit/re-entry is also blocked
    try {
      await axios.post(`${API}/emergency-stop`, { active: newState });
    } catch (e) { console.error('Failed to sync emergency stop:', e); }
  };

  const [debugResult, setDebugResult] = useState(null);
  const runAutoTradeDebug = async () => {
    try {
      const r = await axios.get(`${API}/debug/auto-trade-test`);
      setDebugResult(r.data);
      if (r.data.all_ok) addNotification('success', 'All auto-trade checks PASSED!');
      else addNotification('warning', 'Some auto-trade checks FAILED - see debug panel');
    } catch (e) { addNotification('error', `Debug test failed: ${e.message}`); }
  };

  const executeLatestSignal = async () => {
    try {
      const r = await axios.post(`${API}/trades/execute-signal`, {});
      if (r.data.status === 'success') addNotification('success', r.data.message);
      else addNotification('error', r.data.message);
    } catch (e) { addNotification('error', `Execute failed: ${e.message}`); }
  };

  // Determine portfolio data based on mode
  const displayPortfolio = (() => {
    if (tradingMode === 'LIVE') {
      if (brokerConnected && livePortfolio) {
        // Calculate real-time P&L from active trades (which have proper buy_price)
        const livePnl = trades.reduce((sum, t) => sum + (t.live_pnl || 0), 0);
        return {
          current_value: (livePortfolio.funds?.total || 0),
          total_pnl: livePnl || livePortfolio.total_pnl || 0,
          active_positions: trades.length || livePortfolio.active_positions || 0,
          total_trades: brokerOrders.length,
          winning_trades: brokerOrders.filter(o => (o.status === 'complete' || o.status === 'traded')).length,
          isLive: true,
        };
      }
      // LIVE mode but Upstox not connected - show zeros, not paper data
      return {
        current_value: 0,
        total_pnl: 0,
        active_positions: 0,
        total_trades: 0,
        winning_trades: 0,
        isLive: false,
        isDisconnected: true,
      };
    }
    return portfolio;
  })();

  // Determine active trades based on mode
  // In LIVE mode, use trades from /api/trades/active which merges Upstox data with stored trade data
  // This includes proper entry_price (buy_price fallback), SL, target, etc.
  const displayTrades = (() => {
    if (tradingMode === 'LIVE') {
      // If we have trades from the backend (which already merges Upstox + stored data), use them
      if (trades.length > 0) return trades;
      // Fallback to empty if no trades
      return [];
    }
    return trades;
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 text-gray-900">
      {/* Update Banner */}
      <UpdateBanner />
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

      <div className="container mx-auto px-4 py-6">
        {/* LIVE Trading Warning */}
        {tradingMode === 'LIVE' && (
          <div className={`p-4 rounded-lg mb-4 shadow-lg border-2 ${brokerConnected ? 'bg-gradient-to-r from-red-600 to-orange-600 border-red-700' : 'bg-gradient-to-r from-yellow-500 to-orange-500 border-yellow-600'} text-white`} data-testid="live-trading-warning">
            <div className="flex items-center gap-3">
              <div className="text-3xl">!</div>
              <div className="flex-1">
                {brokerConnected ? (
                  <>
                    <h3 className="font-bold text-lg">LIVE TRADING MODE - CONNECTED</h3>
                    <p className="text-sm">Real money trades active. Market data is LIVE.</p>
                  </>
                ) : (
                  <>
                    <h3 className="font-bold text-lg">LIVE MODE - NOT CONNECTED</h3>
                    <p className="text-sm">Go to Settings &gt; Broker to login to your Broker and start live trading.</p>
                  </>
                )}
              </div>
              <Button onClick={() => setShowSettings(true)} className="bg-white text-red-600 hover:bg-gray-100">Settings</Button>
            </div>
          </div>
        )}

        <MarketStatusBanner />
        <MarketTicker marketIndices={marketIndices} tradingMode={tradingMode} brokerConnected={brokerConnected} />

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

        <RiskPanel riskMetrics={riskMetrics} emergencyStop={emergencyStop} onEmergencyStop={handleEmergencyStop} formatCurrency={formatCurrency} tradingMode={tradingMode} brokerConnected={brokerConnected} />
        <AutoTradingSettings autoSettings={autoSettings} showAutoSettings={showAutoSettings} setShowAutoSettings={setShowAutoSettings} updateAutoSettings={updateAutoSettings} onDebug={runAutoTradeDebug} onExecuteSignal={executeLatestSignal} debugResult={debugResult} />
        <AIGuards />

        {/* Portfolio Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="portfolio-value-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Portfolio Value</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(displayPortfolio?.current_value || 0)}</p>
                {displayPortfolio?.isLive && <p className="text-xs text-green-600 mt-1">Live from Broker</p>}
                {displayPortfolio?.isDisconnected && <p className="text-xs text-yellow-600 mt-1">Connect Broker for live data</p>}
              </div>
              <FaWallet className="text-3xl text-blue-500" />
            </div>
          </Card>
          <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="total-pnl-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Total P&L</p>
                <p className={`text-2xl font-bold ${(displayPortfolio?.total_pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(displayPortfolio?.total_pnl || 0)}
                </p>
                {displayPortfolio?.isLive && <p className="text-xs text-green-600 mt-1">Live from Broker</p>}
                {displayPortfolio?.isDisconnected && <p className="text-xs text-yellow-600 mt-1">Connect Broker for live data</p>}
              </div>
              <FaChartLine className="text-3xl text-green-500" />
            </div>
          </Card>
          <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="active-positions-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Active Positions</p>
                <p className="text-2xl font-bold text-gray-900">{displayPortfolio?.active_positions || 0}</p>
                {displayPortfolio?.isLive && <p className="text-xs text-green-600 mt-1">Live from Broker</p>}
                {displayPortfolio?.isDisconnected && <p className="text-xs text-yellow-600 mt-1">Connect Broker for live data</p>}
              </div>
              <FaBullseye className="text-3xl text-purple-500" />
            </div>
          </Card>
          <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="win-rate-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">{displayPortfolio?.isLive ? 'Orders Today' : 'Win Rate'}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {displayPortfolio?.isLive ? (displayPortfolio?.total_trades || 0) : displayPortfolio?.isDisconnected ? '--' : `${stats?.win_rate?.toFixed(1) || 0}%`}
                </p>
                {displayPortfolio?.isLive && <p className="text-xs text-green-600 mt-1">Live from Broker</p>}
                {displayPortfolio?.isDisconnected && <p className="text-xs text-yellow-600 mt-1">Connect Broker for live data</p>}
              </div>
              <FaBullseye className="text-3xl text-yellow-500" />
            </div>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="news" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-white border-gray-200 shadow-sm">
            <TabsTrigger value="news" data-testid="news-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">News Feed</TabsTrigger>
            <TabsTrigger value="signals" data-testid="signals-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Signals</TabsTrigger>
            <TabsTrigger value="trades" data-testid="trades-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Active Trades</TabsTrigger>
            <TabsTrigger value="history" data-testid="history-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Trade History</TabsTrigger>
            <TabsTrigger value="calculator" data-testid="calculator-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Calculator</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="analytics-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Trade Analytics</TabsTrigger>
            <TabsTrigger value="tax" data-testid="tax-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Tax Reports</TabsTrigger>
            <TabsTrigger value="ai-insights" data-testid="ai-insights-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">AI Brain</TabsTrigger>
            <TabsTrigger value="technical" data-testid="technical-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Technical</TabsTrigger>
            <TabsTrigger value="option-chain" data-testid="option-chain-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Option Chain</TabsTrigger>
            <TabsTrigger value="journal" data-testid="journal-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">AI Journal</TabsTrigger>
          </TabsList>

          <TabsContent value="news"><NewsFeed news={news} formatTime={formatTime} /></TabsContent>
          <TabsContent value="signals"><SignalsList signals={signals} formatCurrency={formatCurrency} formatTime={formatTime} tradingMode={tradingMode} brokerConnected={brokerConnected} /></TabsContent>
          <TabsContent value="trades"><TradesList trades={displayTrades} formatCurrency={formatCurrency} formatTime={formatTime} tradingMode={tradingMode} brokerConnected={brokerConnected} onManualExit={handleManualExit} /></TabsContent>
          <TabsContent value="history"><TradeHistory formatCurrency={formatCurrency} tradingMode={tradingMode} brokerConnected={brokerConnected} brokerOrders={brokerOrders} /></TabsContent>
          <TabsContent value="calculator"><PositionCalculator riskMetrics={riskMetrics} formatCurrency={formatCurrency} /></TabsContent>
          <TabsContent value="analytics"><TradeAnalytics /></TabsContent>
          <TabsContent value="tax"><TaxReports formatCurrency={formatCurrency} /></TabsContent>
          <TabsContent value="ai-insights"><AIInsights /></TabsContent>
          <TabsContent value="technical"><TechnicalAnalysis /></TabsContent>
          <TabsContent value="option-chain"><OptionChain /></TabsContent>
          <TabsContent value="journal"><TradeJournal /></TabsContent>
        </Tabs>

        {/* Live Positions from Upstox */}
        {tradingMode === 'LIVE' && brokerConnected && trades.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-bold text-gray-800 mb-3" data-testid="live-positions-title">Live Positions</h2>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-md">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Symbol</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Qty</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Entry Price</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">LTP</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">P&L</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`live-position-${idx}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">{t.symbol}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{t.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(t.entry_price)}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(t.current_price)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${t.live_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {t.live_pnl >= 0 ? '+' : ''}{formatCurrency(t.live_pnl)}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${t.pnl_percentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {t.pnl_percentage >= 0 ? '+' : ''}{(t.pnl_percentage || 0).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white/80 backdrop-blur-sm mt-8 py-4 shadow-sm">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600">
          <p>{tradingMode === 'LIVE' ? 'LIVE TRADING' : 'Paper Trading'} Mode | AI-Powered Options Trading Bot | v4.4.0</p>
          <p className="text-xs mt-1 text-gray-500">Trading involves risk. Past performance does not guarantee future results.</p>
        </div>
      </footer>

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onSave={() => { setShowSettings(false); loadData(); loadAutoSettings(); }}
        />
      )}
    </div>
  );
}

export default App;
