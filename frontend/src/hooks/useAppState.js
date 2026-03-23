import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const BACKEND_URL = (() => {
  const envUrl = process.env.REACT_APP_BACKEND_URL || '';
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return '';
  }
  return envUrl;
})();
const API = `${BACKEND_URL}/api`;

const WS_URL = (() => {
  const base = BACKEND_URL || window.location.origin;
  return base.replace(/^http/, 'ws') + '/api/ws/market-data';
})();

export { API, BACKEND_URL, WS_URL };

export default function useAppState() {
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
  const [appVersion, setAppVersion] = useState('');
  const [debugResult, setDebugResult] = useState(null);

  const addNotification = useCallback((type, message) => {
    const id = Date.now();
    setNotifications(prev => [{ id, type, message, timestamp: new Date() }, ...prev].slice(0, 5));
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
  }, []);

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

  const handleManualExit = useCallback(async (trade) => {
    try {
      const res = await axios.post(`${API}/trades/manual-exit`, {
        instrument_token: trade.instrument_token,
        trade_id: trade.id,
      });
      if (res.data.status === 'success') {
        addNotification('success', res.data.message || 'Position closed successfully');
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
      
      // Token expired - show clear warning
      if (data.token_expired) {
        addNotification('error', data.error_message || 'Upstox token expired! Re-login in Settings > Broker.');
        setBrokerConnected(false);
        setLivePortfolio(null);
        return;
      }
      
      if (data.upstox_connected) {
        if (data.market_data) setMarketIndices(data.market_data);
        if (data.portfolio) setLivePortfolio(data.portfolio);
        if (data.orders) setBrokerOrders(data.orders);
        if (data.profile) setBrokerProfile(data.profile);
        if (data.portfolio) {
          const lp = data.portfolio;
          const completedOrders = data.orders || [];
          const riskSettings = {};
          try {
            const setRes = await axios.get(`${API}/settings`);
            Object.assign(riskSettings, setRes.data?.settings?.risk || {});
          } catch (_) {}
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
            maxPerTrade: riskSettings.max_per_trade || Math.floor((lp.funds?.available_margin || lp.funds?.total || 200000) * 0.25),
            todayTrades: completedOrders.length,
            todayPnL: todayPnlVal,
            isLive: true,
          });
        }
      } else {
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
      if (settingsRes.data?.settings?.emergency_stop) setEmergencyStop(true);
      if (mode !== 'LIVE') {
        const todayData = todayRes.data;
        const riskCfg = settingsRes.data?.settings?.risk || {};
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
      if (mode === 'LIVE') await loadUpstoxData();
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
      // Check if guard blocked the analysis (saves API balance)
      if (response.data.guard_blocked) {
        addNotification('warning', response.data.message || 'Analysis skipped - daily limit hit');
      } else {
        const articles = response.data.articles || [];
        const highConfidence = articles.filter(a => a.sentiment_analysis?.confidence >= 80 && a.signal_generated);
        if (highConfidence.length > 0) addNotification('success', `${highConfidence.length} high-confidence signal(s)!`);
        if (articles.length > 0) addNotification('info', `Analyzed ${articles.length} news articles`);
      }
      await loadData();
    } catch (error) {
      addNotification('error', 'Failed to fetch news');
    } finally {
      setFetchingNews(false);
    }
  }, [emergencyStop, addNotification, loadData]);

  const handleEmergencyStop = async () => {
    const newState = !emergencyStop;
    setEmergencyStop(newState);
    if (newState) {
      addNotification('warning', 'Emergency Stop Activated! All trading halted.');
      setAutoAnalyze(false);
    } else {
      addNotification('success', 'Trading resumed!');
    }
    try {
      await axios.post(`${API}/emergency-stop`, { active: newState });
    } catch (e) { console.error('Failed to sync emergency stop:', e); }
  };

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

  // Initialize
  useEffect(() => {
    const init = async () => {
      try {
        await axios.post(`${API}/initialize`);
        await loadData();
        await loadAutoSettings();
        try {
          const settingsRes = await axios.get(`${API}/settings`);
          const autoAnalysis = settingsRes.data?.settings?.auto_trading?.auto_analysis;
          if (typeof autoAnalysis === 'boolean') setAutoAnalyze(autoAnalysis);
        } catch (_) {}
        try {
          const healthRes = await axios.get(`${API}/health`);
          if (healthRes.data?.version) setAppVersion(healthRes.data.version);
        } catch (_) {}
      } catch (error) {
        console.error('Initialize error:', error);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto square-off check near market close
  const checkSquareOff = useCallback(async () => {
    const now = new Date();
    const istOffset = 5.5 * 60;
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const istMinutes = (utcMinutes + istOffset) % 1440;
    if (istMinutes >= 915 && istMinutes <= 925) {
      try {
        const res = await axios.post(`${API}/market/square-off-check`);
        if (res.data?.open_count > 0) {
          addNotification('warning', `Square-off warning: ${res.data.open_count} position(s) open near market close!`);
        }
      } catch (_) {}
    }
  }, [addNotification]);

  // Auto-analysis, exit checks, news fetch intervals
  useEffect(() => {
    const dataInterval = setInterval(loadData, 30000);
    const exitInterval = setInterval(() => {
      if (autoSettings.auto_exit && !emergencyStop) checkAutoExits();
    }, 10000);
    const shouldAutoFetch = autoAnalyze || autoSettings.auto_entry;
    const analysisInterval = setInterval(() => {
      if (shouldAutoFetch && !emergencyStop) fetchNewNews();
    }, 3 * 60 * 1000);
    if (autoSettings.auto_entry && !emergencyStop) fetchNewNews();
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

  // Ultra-fast market data polling
  useEffect(() => {
    let marketInterval;
    if (tradingMode === 'LIVE' && brokerConnected) {
      loadMarketDataQuick();
      marketInterval = setInterval(loadMarketDataQuick, 500);
    } else if (tradingMode !== 'LIVE') {
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

  // 1-second auto-refresh for Active Trades tab
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
      fetchActiveTrades();
      tradeInterval = setInterval(fetchActiveTrades, 1000);
    }
    return () => { if (tradeInterval) clearInterval(tradeInterval); };
  }, [activeTab]);

  // WebSocket for real-time market data
  useEffect(() => {
    if (tradingMode !== 'LIVE' || !brokerConnected) {
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
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'ping' }));
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
          reconnectTimer = setTimeout(connect, 5000);
        };
        ws.onerror = () => { ws.close(); };
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

  // Formatters
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

  // Display portfolio based on mode
  const displayPortfolio = (() => {
    if (tradingMode === 'LIVE') {
      if (brokerConnected && livePortfolio) {
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
      return { current_value: 0, total_pnl: 0, active_positions: 0, total_trades: 0, winning_trades: 0, isLive: false, isDisconnected: true };
    }
    return portfolio;
  })();

  const displayTrades = (() => {
    if (tradingMode === 'LIVE') return trades.length > 0 ? trades : [];
    return trades;
  })();

  return {
    // State
    portfolio, news, signals, trades, stats, loading, fetchingNews,
    autoAnalyze, setAutoAnalyze, nextAnalysis, emergencyStop,
    notifications, setNotifications, riskMetrics, autoSettings,
    showAutoSettings, setShowAutoSettings, marketIndices,
    showSettings, setShowSettings, tradingMode, brokerConnected,
    brokerProfile, brokerOrders, wsConnected, activeTab, setActiveTab,
    appVersion, debugResult,
    // Computed
    displayPortfolio, displayTrades,
    // Actions
    addNotification, loadData, loadAutoSettings, updateAutoSettings,
    fetchNewNews, handleEmergencyStop, handleManualExit,
    runAutoTradeDebug, executeLatestSignal,
    // Formatters
    formatCurrency, formatTime, formatCountdown,
  };
}
