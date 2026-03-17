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

  useEffect(() => {
    loadSettings();
    checkUpstoxConnection();
  }, []);

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
      const res = await axios.get(`${API}/upstox/connection`);
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
      const res = await axios.get(`${API}/upstox/auth-url`);
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
      const res = await axios.post(`${API}/upstox/callback`, { code: authCode.trim() });
      if (res.data.status === 'success') {
        alert('Upstox connected successfully!');
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
            <TabsList className="grid grid-cols-4 gap-2 mb-6">
              <TabsTrigger value="broker" data-testid="broker-tab">Broker</TabsTrigger>
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

              {/* Upstox Connection Status */}
              <div className={`p-4 rounded-lg border-2 ${upstoxStatus.connected ? 'bg-green-50 border-green-400' : 'bg-yellow-50 border-yellow-400'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-800">Upstox Connection</h3>
                    <p className="text-sm text-gray-600 mt-1">{upstoxStatus.message || 'Not connected'}</p>
                  </div>
                  <Badge data-testid="upstox-connection-badge" className={upstoxStatus.connected ? 'bg-green-600' : 'bg-yellow-600'}>
                    {upstoxStatus.connected ? 'CONNECTED' : 'DISCONNECTED'}
                  </Badge>
                </div>
              </div>

              {/* Upstox Credentials */}
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-3">Upstox API Credentials</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                    <input type="text" value={settings.broker.api_key} onChange={(e) => updateField('broker', 'api_key', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Enter Upstox API Key" data-testid="broker-api-key" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Secret</label>
                    <input type="password" value={settings.broker.api_secret} onChange={(e) => updateField('broker', 'api_secret', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Enter Upstox API Secret" data-testid="broker-api-secret" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Redirect URI</label>
                    <input type="text" value={settings.broker.redirect_uri} onChange={(e) => updateField('broker', 'redirect_uri', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="https://yourapp.com/callback" data-testid="broker-redirect-uri" />
                    <button onClick={() => { updateField('broker', 'redirect_uri', `${window.location.origin}/callback`); }} className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700" data-testid="use-current-url-btn">Use Current URL</button>
                  </div>
                </div>
              </div>

              {/* OAuth Login Flow */}
              <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border border-green-300">
                <h3 className="font-bold text-gray-800 mb-3">Connect to Upstox</h3>
                <p className="text-sm text-gray-600 mb-3">Step 1: Save settings, then click Login. Step 2: Login on Upstox. Step 3: Copy the code from URL and paste below.</p>

                <div className="space-y-3">
                  <Button onClick={handleUpstoxLogin} className="bg-gradient-to-r from-green-600 to-blue-600 text-white w-full" data-testid="upstox-login-btn">
                    Login to Upstox (Opens New Tab)
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
                      <li>Click "Login to Upstox" button above</li>
                      <li>Login with your Upstox credentials</li>
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
                <h4 className="font-semibold text-gray-800 mb-2">Where to get Upstox API credentials?</h4>
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
