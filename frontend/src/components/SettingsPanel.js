import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import axios from 'axios';

const BACKEND_URL = (() => {
  const envUrl = process.env.REACT_APP_BACKEND_URL || '';
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) return '';
  return envUrl;
})();
const API = `${BACKEND_URL}/api`;

export default function SettingsPanel({ onClose, onSave }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('broker');
  const [upstoxStatus, setUpstoxStatus] = useState({ connected: false, message: '' });
  const [authCode, setAuthCode] = useState('');
  const [connectingUpstox, setConnectingUpstox] = useState(false);
  const [sendingSummary, setSendingSummary] = useState(false);
  const [instruments, setInstruments] = useState({});
  const [activeInstrument, setActiveInstrument] = useState('NIFTY50');
  const [brokers, setBrokers] = useState([]);
  const [activeBroker, setActiveBroker] = useState('upstox');

  useEffect(() => {
    loadSettings();
    checkUpstoxConnection();
    loadInstruments();
    loadBrokers();
  }, []);

  const loadBrokers = async () => {
    try {
      const res = await axios.get(`${API}/brokers/list`);
      if (res.data.status === 'success') {
        setBrokers(res.data.brokers || []);
        setActiveBroker(res.data.active || 'upstox');
      }
    } catch (e) {
      console.error('Load brokers error:', e);
    }
  };

  const handleBrokerChange = async (brokerId) => {
    try {
      const res = await axios.post(`${API}/brokers/set-active`, { broker_id: brokerId });
      if (res.data.status === 'success') {
        setActiveBroker(brokerId);
        // Re-check connection for newly selected broker
        checkUpstoxConnection();
      }
    } catch (e) {
      console.error('Set broker error:', e);
    }
  };

  const loadInstruments = async () => {
    try {
      const res = await axios.get(`${API}/instruments`);
      if (res.data.status === 'success') {
        setInstruments(res.data.details || {});
        setActiveInstrument(res.data.active || 'NIFTY50');
      }
    } catch (e) {
      console.error('Load instruments error:', e);
    }
  };

  const handleInstrumentChange = async (instrument) => {
    try {
      const res = await axios.post(`${API}/instruments/set`, { instrument });
      if (res.data.status === 'success') {
        setActiveInstrument(instrument);
      }
    } catch (e) {
      console.error('Set instrument error:', e);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await axios.get(`${API}/settings`);
      if (response.data.status === 'success') setSettings(response.data.settings);
    } catch (error) {
      console.error('Load settings error:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkUpstoxConnection = async () => {
    try {
      const res = await axios.get(`${API}/brokers/connection`);
      setUpstoxStatus(res.data);
    } catch (e) {
      setUpstoxStatus({ connected: false, message: 'Failed to check' });
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await axios.post(`${API}/settings/update`, settings);
      if (response.data.status === 'success') {
        alert('Settings saved successfully!');
        if (onSave) onSave(settings);
      } else {
        alert('Failed to save: ' + response.data.message);
      }
    } catch (error) {
      alert('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (section, field, value) => {
    setSettings(prev => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  };

  const toggleDay = (day) => {
    const days = settings.schedule.trading_days || [];
    const newDays = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
    updateField('schedule', 'trading_days', newDays);
  };

  const handleUpstoxLogin = async () => {
    // Save settings first
    await saveSettings();
    try {
      const res = await axios.get(`${API}/brokers/auth-url`);
      if (res.data.status === 'success') {
        window.open(res.data.auth_url, '_blank');
      } else {
        alert(res.data.message);
      }
    } catch (e) {
      alert('Failed to generate login URL');
    }
  };

  const handleCodeSubmit = async () => {
    if (!authCode.trim()) { alert('Please enter the authorization code'); return; }
    setConnectingUpstox(true);
    try {
      const res = await axios.post(`${API}/brokers/callback`, { code: authCode.trim() });
      if (res.data.status === 'success') {
        alert('Broker connected successfully!');
        setAuthCode('');
        await checkUpstoxConnection();
      } else {
        alert('Failed: ' + res.data.message);
      }
    } catch (e) {
      alert('Connection failed. Please try again.');
    } finally {
      setConnectingUpstox(false);
    }
  };

  const sendDailySummary = async () => {
    setSendingSummary(true);
    try {
      // Save settings first to ensure latest telegram config
      await saveSettings();
      const res = await axios.post(`${API}/telegram/send-daily-summary`);
      if (res.data.status === 'success') {
        alert('Daily summary sent to Telegram!');
      } else {
        alert(res.data.message || 'Failed to send summary');
      }
    } catch (e) {
      alert('Error sending summary: ' + (e.response?.data?.message || e.message));
    } finally {
      setSendingSummary(false);
    }
  };

  if (loading) return <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><div className="bg-white p-8 rounded-lg">Loading settings...</div></div>;
  if (!settings) return <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><div className="bg-white p-8 rounded-lg text-red-600">Failed to load settings</div></div>;

  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Card className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800" data-testid="settings-title">Bot Settings</h2>
            <Button onClick={onClose} variant="ghost" data-testid="settings-close">x Close</Button>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-5 gap-2 mb-6">
              <TabsTrigger value="broker" data-testid="broker-tab">Broker</TabsTrigger>
              <TabsTrigger value="trading" data-testid="trading-tab">Trading</TabsTrigger>
              <TabsTrigger value="risk" data-testid="risk-tab">Risk</TabsTrigger>
              <TabsTrigger value="schedule" data-testid="schedule-tab">Schedule</TabsTrigger>
              <TabsTrigger value="advanced" data-testid="advanced-tab">Advanced</TabsTrigger>
            </TabsList>

            {/* ===== Broker Tab ===== */}
            <TabsContent value="broker" className="space-y-4">
              {/* Trading Mode */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="font-bold text-gray-800 mb-3">Trading Mode</h3>
                <div className="flex gap-4">
                  <Button onClick={() => setSettings(prev => ({ ...prev, trading_mode: 'PAPER' }))} className={settings.trading_mode === 'PAPER' ? 'bg-blue-600' : 'bg-gray-400'} data-testid="paper-mode-btn">Paper Trading</Button>
                  <Button onClick={() => setSettings(prev => ({ ...prev, trading_mode: 'LIVE' }))} className={settings.trading_mode === 'LIVE' ? 'bg-green-600' : 'bg-gray-400'} data-testid="live-mode-btn">Live Trading</Button>
                </div>
                <div className="text-sm text-gray-600 mt-2 flex items-center gap-1">Current: <Badge className={settings.trading_mode === 'LIVE' ? 'bg-red-600' : 'bg-blue-600'}>{settings.trading_mode}</Badge></div>
              </div>

              {/* Broker Selector */}
              <div className="bg-gradient-to-r from-slate-50 to-blue-50 p-4 rounded-lg border border-slate-200">
                <h3 className="font-bold text-gray-800 mb-3">Select Broker</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {brokers.map(b => (
                    <div key={b.id}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${activeBroker === b.id ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                      onClick={() => handleBrokerChange(b.id)}
                      data-testid={`broker-${b.id}`}
                    >
                      <p className="font-bold text-sm text-gray-800">{b.name}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{b.description}</p>
                      {activeBroker === b.id && <Badge className="bg-blue-600 mt-1 text-[10px]">Active</Badge>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Broker Connection Status */}
              <div className={`p-4 rounded-lg border-2 ${upstoxStatus.connected ? 'bg-green-50 border-green-400' : 'bg-yellow-50 border-yellow-400'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-800">{brokers.find(b => b.id === activeBroker)?.name || 'Broker'} Connection</h3>
                    <p className="text-sm text-gray-600 mt-1">{upstoxStatus.message || 'Not connected'}</p>
                  </div>
                  <Badge data-testid="upstox-connection-badge" className={upstoxStatus.connected ? 'bg-green-600' : 'bg-yellow-600'}>
                    {upstoxStatus.connected ? 'CONNECTED' : 'DISCONNECTED'}
                  </Badge>
                </div>
              </div>

              {/* Broker Credentials */}
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-3">{brokers.find(b => b.id === activeBroker)?.name || 'Broker'} API Credentials</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                    <input type="text" value={settings.broker[`${activeBroker}_api_key`] || ''} onChange={(e) => updateField('broker', `${activeBroker}_api_key`, e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={`Enter ${brokers.find(b => b.id === activeBroker)?.name || 'Broker'} API Key`} data-testid="broker-api-key" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Secret</label>
                    <input type="password" value={settings.broker[`${activeBroker}_api_secret`] || ''} onChange={(e) => updateField('broker', `${activeBroker}_api_secret`, e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={`Enter ${brokers.find(b => b.id === activeBroker)?.name || 'Broker'} API Secret`} data-testid="broker-api-secret" />
                  </div>
                  {(activeBroker === 'angelone' || activeBroker === '5paisa' || activeBroker === 'iifl') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                      <input type="text" value={settings.broker[`${activeBroker}_client_id`] || ''} onChange={(e) => updateField('broker', `${activeBroker}_client_id`, e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Enter Client ID" data-testid="broker-client-id" />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Redirect URI</label>
                    <input type="text" value={settings.broker.redirect_uri || ''} onChange={(e) => updateField('broker', 'redirect_uri', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="https://yourapp.com/callback" data-testid="broker-redirect-uri" />
                    <button onClick={() => { updateField('broker', 'redirect_uri', `${window.location.origin}/callback`); }} className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700" data-testid="use-current-url-btn">Use Current URL</button>
                  </div>
                </div>
              </div>

              {/* OAuth Login Flow */}
              <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border border-green-300">
                <h3 className="font-bold text-gray-800 mb-3">Connect to {brokers.find(b => b.id === activeBroker)?.name || 'Broker'}</h3>
                <p className="text-sm text-gray-600 mb-3">Step 1: Save settings, then click Login. Step 2: Login on broker. Step 3: Copy the code from URL and paste below.</p>

                <div className="space-y-3">
                  <Button onClick={handleUpstoxLogin} className="bg-gradient-to-r from-green-600 to-blue-600 text-white w-full" data-testid="broker-login-btn">
                    Login to {brokers.find(b => b.id === activeBroker)?.name || 'Broker'} (Opens New Tab)
                  </Button>

                  <div className="flex gap-2">
                    <input type="text" value={authCode} onChange={(e) => setAuthCode(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg" placeholder="Paste authorization code from URL here..." data-testid="auth-code-input" />
                    <Button onClick={handleCodeSubmit} disabled={connectingUpstox} className="bg-green-600 text-white" data-testid="submit-code-btn">
                      {connectingUpstox ? 'Connecting...' : 'Connect'}
                    </Button>
                  </div>

                  <div className="bg-yellow-50 p-3 rounded border border-yellow-200 text-xs text-gray-700">
                    <p className="font-semibold mb-1">How to get the code:</p>
                    <ol className="list-decimal ml-4 space-y-1">
                      <li>Click "Login to Broker" button above</li>
                      <li>Login with your broker credentials</li>
                      <li>After login, you'll be redirected to your Redirect URI</li>
                      <li>Copy the <strong>code</strong> parameter from the URL</li>
                      <li>Example: yoursite.com/callback?<strong>code=aBC123xyz</strong></li>
                      <li>Paste that code above and click Connect</li>
                    </ol>
                    <p className="mt-2 text-orange-700 font-semibold">Note: Token expires every 24 hours (SEBI rule). You need to re-login daily.</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 text-xs">
                <h4 className="font-semibold text-gray-800 mb-2">Where to get API credentials?</h4>
                <ol className="list-decimal ml-4 space-y-1 text-gray-700">
                  <li>Go to <a href="https://api.upstox.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">Upstox Developer Portal</a></li>
                  <li>Create a new app</li>
                  <li>Set your Redirect URI in the app settings</li>
                  <li>Copy API Key and API Secret</li>
                  <li>The Redirect URI must match exactly in both places!</li>
                </ol>
              </div>
            </TabsContent>

            {/* ===== Risk Tab ===== */}
            <TabsContent value="risk" className="space-y-4">

            {/* ===== Trading Instrument Tab ===== */}
            </TabsContent>
            <TabsContent value="trading" className="space-y-4">
              <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-4 rounded-lg border border-indigo-200">
                <h3 className="font-bold text-gray-800 mb-3">Trading Instrument</h3>
                <p className="text-sm text-gray-600 mb-4">Select which index options to trade. All signals and trades will use this instrument.</p>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(instruments).map(([key, inst]) => (
                    <div key={key}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${activeInstrument === key ? 'border-indigo-500 bg-indigo-50 shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                      onClick={() => handleInstrumentChange(key)}
                      data-testid={`instrument-${key}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-gray-800">{inst.label}</p>
                          <p className="text-xs text-gray-500 mt-1">Lot: {inst.lot_size} | Step: {inst.strike_step} | Premium: ~{inst.option_premium}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${activeInstrument === key ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                          {activeInstrument === key && <span className="text-white text-xs font-bold">&#10003;</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-gray-700">
                  <div className="font-semibold">Current: <Badge className="bg-indigo-600">{instruments[activeInstrument]?.label || activeInstrument}</Badge></div>
                  <p className="mt-1">Instrument change applies to new signals only. Existing trades remain on their original instrument.</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="risk" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Initial Capital</label>
                  <input type="number" value={settings.risk.initial_capital} onChange={(e) => updateField('risk', 'initial_capital', parseInt(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" min="10000" step="10000" />
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Daily Limit</label>
                  <input type="number" value={settings.risk.daily_limit} onChange={(e) => updateField('risk', 'daily_limit', parseInt(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" min="10000" step="10000" />
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Per Trade</label>
                  <input type="number" value={settings.risk.max_per_trade} onChange={(e) => updateField('risk', 'max_per_trade', parseInt(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" min="1000" step="1000" />
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Risk Tolerance</label>
                  <select value={settings.risk.risk_tolerance} onChange={(e) => updateField('risk', 'risk_tolerance', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    <option value="low">Low (15% SL, 30% Target)</option>
                    <option value="medium">Medium (25% SL, 50% Target)</option>
                    <option value="high">High (35% SL, 70% Target)</option>
                  </select>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stop Loss (%)</label>
                  <input type="number" value={settings.risk.stop_loss_pct} onChange={(e) => updateField('risk', 'stop_loss_pct', parseInt(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" min="5" max="50" />
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Profit (%)</label>
                  <input type="number" value={settings.risk.target_pct} onChange={(e) => updateField('risk', 'target_pct', parseInt(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" min="5" max="100" />
                </div>
              </div>
            </TabsContent>

            {/* ===== Schedule Tab ===== */}
            <TabsContent value="schedule" className="space-y-4">
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">Trading Schedule</h3>
                  <Button onClick={() => updateField('schedule', 'enabled', !settings.schedule.enabled)} className={settings.schedule.enabled ? 'bg-green-600' : 'bg-gray-400'}>
                    {settings.schedule.enabled ? 'Enabled' : 'Disabled'}
                  </Button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Trading Days</label>
                    <div className="flex flex-wrap gap-2">
                      {weekDays.map(day => (
                        <Button key={day} onClick={() => toggleDay(day)} className={settings.schedule.trading_days?.includes(day) ? 'bg-blue-600' : 'bg-gray-300 text-gray-700'} size="sm">{day.slice(0, 3)}</Button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Selected: {settings.schedule.trading_days?.join(', ') || 'None'}</p>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                      <input type="time" value={settings.schedule.start_time} onChange={(e) => updateField('schedule', 'start_time', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                      <input type="time" value={settings.schedule.end_time} onChange={(e) => updateField('schedule', 'end_time', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ===== Advanced Tab ===== */}
            <TabsContent value="advanced" className="space-y-4">
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-lg border border-purple-200">
                <h3 className="font-bold text-gray-800 mb-3">AI Model Configuration</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Emergent LLM Key (Universal Key)</label>
                    <input type="password" value={settings.ai?.emergent_llm_key || ''} onChange={(e) => updateField('ai', 'emergent_llm_key', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Enter your Emergent LLM Key" data-testid="ai-key-input" />
                    <p className="text-xs text-gray-500 mt-1">Get from: Profile → Universal Key on Emergent platform. Without key, keyword-based analysis will be used.</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded border border-blue-200 text-sm text-gray-700">
                    Currently using: <Badge className="bg-blue-600">GPT-4.1-mini</Badge> for news sentiment analysis
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-3">News Source Configuration</h3>
                <div className="space-y-4">
                  <div className="bg-blue-50 p-3 rounded border border-blue-200">
                    <p className="text-sm font-semibold text-gray-800">Active Sources:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(settings.news.sources || ['demo']).map(s => (
                        <Badge key={s} className="bg-blue-600 text-xs">{s}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select News Sources</label>
                    <div className="space-y-2">
                      {[
                        { value: 'demo', label: 'Demo News (Free - Practice)', desc: 'Simulated news for paper trading' },
                        { value: 'moneycontrol', label: 'Moneycontrol (Free)', desc: 'Live scraping from Moneycontrol RSS' },
                        { value: 'economictimes', label: 'Economic Times (Free)', desc: 'Live scraping from ET Markets RSS' },
                        { value: 'nse_india', label: 'NSE India (Free)', desc: 'Corporate announcements from NSE' },
                        { value: 'ndtv_profit', label: 'NDTV Profit (Free)', desc: 'Business & market news from NDTV Profit' },
                        { value: 'cnbc_tv18', label: 'CNBC TV18 (Free)', desc: 'Market & economy news from CNBC TV18' },
                        { value: 'livemint', label: 'Livemint (Free)', desc: 'Markets news from Livemint' },
                        { value: 'newsapi', label: 'NewsAPI.org (API Key)', desc: 'Global news API - requires key' },
                        { value: 'alphavantage', label: 'Alpha Vantage (API Key)', desc: 'Financial news with sentiment - requires key' },
                      ].map(src => {
                        const isSelected = (settings.news.sources || []).includes(src.value);
                        return (
                          <div key={src.value} className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                            onClick={() => {
                              const current = settings.news.sources || [];
                              const newSources = isSelected ? current.filter(s => s !== src.value) : [...current, src.value];
                              updateField('news', 'sources', newSources.length > 0 ? newSources : ['demo']);
                            }}>
                            <div>
                              <p className="font-medium text-gray-800 text-sm">{src.label}</p>
                              <p className="text-xs text-gray-500">{src.desc}</p>
                            </div>
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                              {isSelected && <span className="text-white text-xs font-bold">&#10003;</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Selected: {(settings.news.sources || ['demo']).join(', ')}</p>
                  </div>
                  <div className="border-l-4 border-green-500 pl-4">
                    <h4 className="font-semibold text-gray-800 mb-2">NewsAPI.org</h4>
                    <input type="text" value={settings.news.newsapi_key} onChange={(e) => updateField('news', 'newsapi_key', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2" placeholder="Enter NewsAPI.org key" />
                    <p className="text-xs text-gray-600">Get from: <a href="https://newsapi.org" target="_blank" rel="noreferrer" className="text-blue-600 underline">newsapi.org</a> | Free: 100 req/day</p>
                  </div>
                  <div className="border-l-4 border-purple-500 pl-4">
                    <h4 className="font-semibold text-gray-800 mb-2">Alpha Vantage</h4>
                    <input type="text" value={settings.news.alphavantage_key} onChange={(e) => updateField('news', 'alphavantage_key', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2" placeholder="Enter Alpha Vantage key" />
                    <p className="text-xs text-gray-600">Get from: <a href="https://www.alphavantage.co" target="_blank" rel="noreferrer" className="text-blue-600 underline">alphavantage.co</a> | Free: 500 calls/day</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Min Confidence for Trading (%)</label>
                    <input type="number" value={settings.news.min_confidence} onChange={(e) => updateField('news', 'min_confidence', parseInt(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" min="50" max="95" />
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-3">Auto-Trading Controls</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div><p className="font-medium text-gray-800">Auto-Exit</p><p className="text-xs text-gray-600">Close trades at target/SL</p></div>
                    <Button onClick={() => updateField('auto_trading', 'auto_exit', !settings.auto_trading.auto_exit)} className={settings.auto_trading.auto_exit ? 'bg-green-600' : 'bg-gray-400'}>{settings.auto_trading.auto_exit ? 'ON' : 'OFF'}</Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div><p className="font-medium text-gray-800">Auto-Entry</p><p className="text-xs text-gray-600">Open new trade after profit</p></div>
                    <Button onClick={() => updateField('auto_trading', 'auto_entry', !settings.auto_trading.auto_entry)} className={settings.auto_trading.auto_entry ? 'bg-green-600' : 'bg-gray-400'}>{settings.auto_trading.auto_entry ? 'ON' : 'OFF'}</Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div><p className="font-medium text-gray-800">Auto-Analysis</p><p className="text-xs text-gray-600">Automatic news analysis</p></div>
                    <Button onClick={() => updateField('auto_trading', 'auto_analysis', !settings.auto_trading.auto_analysis)} className={settings.auto_trading.auto_analysis ? 'bg-green-600' : 'bg-gray-400'}>{settings.auto_trading.auto_analysis ? 'ON' : 'OFF'}</Button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Analysis Interval (minutes)</label>
                    <input type="number" value={settings.auto_trading.analysis_interval_minutes} onChange={(e) => updateField('auto_trading', 'analysis_interval_minutes', parseInt(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" min="1" max="60" />
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-3">Notifications</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div><p className="font-medium text-gray-800">Desktop Notifications</p><p className="text-xs text-gray-600">Windows popup on signal/entry/exit</p></div>
                    <Button onClick={() => updateField('notifications', 'desktop', !(settings.notifications?.desktop !== false))} className={(settings.notifications?.desktop !== false) ? 'bg-green-600' : 'bg-gray-400'}>{(settings.notifications?.desktop !== false) ? 'ON' : 'OFF'}</Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div><p className="font-medium text-gray-800">On Signal</p><p className="text-xs text-gray-600">Notify when BUY_CALL/PUT detected</p></div>
                    <Button onClick={() => updateField('notifications', 'on_signal', !(settings.notifications?.on_signal !== false))} className={(settings.notifications?.on_signal !== false) ? 'bg-green-600' : 'bg-gray-400'}>{(settings.notifications?.on_signal !== false) ? 'ON' : 'OFF'}</Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div><p className="font-medium text-gray-800">On Entry</p><p className="text-xs text-gray-600">Notify on trade entry</p></div>
                    <Button onClick={() => updateField('notifications', 'on_entry', !(settings.notifications?.on_entry !== false))} className={(settings.notifications?.on_entry !== false) ? 'bg-green-600' : 'bg-gray-400'}>{(settings.notifications?.on_entry !== false) ? 'ON' : 'OFF'}</Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div><p className="font-medium text-gray-800">On Exit</p><p className="text-xs text-gray-600">Notify on trade exit (target/SL)</p></div>
                    <Button onClick={() => updateField('notifications', 'on_exit', !(settings.notifications?.on_exit !== false))} className={(settings.notifications?.on_exit !== false) ? 'bg-green-600' : 'bg-gray-400'}>{(settings.notifications?.on_exit !== false) ? 'ON' : 'OFF'}</Button>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-3">Telegram Notifications</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div><p className="font-medium text-gray-800">Enable Telegram</p><p className="text-xs text-gray-600">Send alerts to Telegram</p></div>
                    <Button onClick={() => { updateField('telegram', 'enabled', !settings.telegram?.enabled); updateField('notifications', 'telegram', !settings.telegram?.enabled); }} className={settings.telegram?.enabled ? 'bg-green-600' : 'bg-gray-400'}>{settings.telegram?.enabled ? 'ON' : 'OFF'}</Button>
                  </div>
                  {settings.telegram?.enabled && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bot Token</label>
                        <input type="password" value={settings.telegram?.bot_token || ''} onChange={(e) => updateField('telegram', 'bot_token', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="123456:ABCdefGH..." data-testid="telegram-token" />
                        <p className="text-xs text-gray-500 mt-1">Create bot: Message @BotFather on Telegram, /newbot</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Chat ID</label>
                        <input type="text" value={settings.telegram?.chat_id || ''} onChange={(e) => updateField('telegram', 'chat_id', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Your Chat ID" data-testid="telegram-chatid" />
                        <p className="text-xs text-gray-500 mt-1">Get ID: Message @userinfobot on Telegram</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <div><p className="font-medium text-gray-800">Daily P&L Summary</p><p className="text-xs text-gray-600">Auto-send daily report after market close</p></div>
                        <Button onClick={() => updateField('telegram', 'daily_summary', !settings.telegram?.daily_summary)} className={settings.telegram?.daily_summary ? 'bg-green-600' : 'bg-gray-400'}>{settings.telegram?.daily_summary ? 'ON' : 'OFF'}</Button>
                      </div>
                      <Button onClick={sendDailySummary} disabled={sendingSummary} className="bg-gradient-to-r from-blue-500 to-purple-500 text-white w-full" data-testid="send-daily-summary-btn">
                        {sendingSummary ? 'Sending...' : 'Send Daily Summary Now'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-6 flex gap-3 justify-end">
            <Button onClick={onClose} variant="outline" className="border-gray-300">Cancel</Button>
            <Button onClick={saveSettings} disabled={saving} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700" data-testid="save-settings-btn">
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
