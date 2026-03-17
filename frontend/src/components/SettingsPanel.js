import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SettingsPanel({ onClose, onSave }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('broker');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await axios.get(`${API}/settings`);
      if (response.data.status === 'success') {
        setSettings(response.data.settings);
      }
    } catch (error) {
      console.error('Load settings error:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await axios.post(`${API}/settings/update`, settings);
      if (response.data.status === 'success') {
        alert('✅ Settings saved successfully!');
        if (onSave) onSave(settings);
      } else {
        alert('❌ Failed to save: ' + response.data.message);
      }
    } catch (error) {
      console.error('Save settings error:', error);
      alert('❌ Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (section, field, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const toggleDay = (day) => {
    const days = settings.schedule.trading_days || [];
    const newDays = days.includes(day)
      ? days.filter(d => d !== day)
      : [...days, day];
    updateField('schedule', 'trading_days', newDays);
  };

  if (loading) {
    return <div className="p-8 text-center">Loading settings...</div>;
  }

  if (!settings) {
    return <div className="p-8 text-center text-red-600">Failed to load settings</div>;
  }

  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card 
        className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">⚙️ Bot Settings</h2>
            <Button onClick={onClose} variant="ghost">✕ Close</Button>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 gap-2 mb-6">
              <TabsTrigger value="broker">🏦 Broker</TabsTrigger>
              <TabsTrigger value="risk">⚠️ Risk</TabsTrigger>
              <TabsTrigger value="schedule">📅 Schedule</TabsTrigger>
              <TabsTrigger value="advanced">🔧 Advanced</TabsTrigger>
            </TabsList>

            {/* Broker Tab */}
            <TabsContent value="broker" className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="font-bold text-gray-800 mb-3">Trading Mode</h3>
                <div className="flex gap-4">
                  <Button
                    onClick={() => setSettings(prev => ({ ...prev, trading_mode: 'PAPER' }))}
                    className={settings.trading_mode === 'PAPER' ? 'bg-blue-600' : 'bg-gray-400'}
                  >
                    📝 Paper Trading
                  </Button>
                  <Button
                    onClick={() => setSettings(prev => ({ ...prev, trading_mode: 'LIVE' }))}
                    className={settings.trading_mode === 'LIVE' ? 'bg-green-600' : 'bg-gray-400'}
                  >
                    🔴 Live Trading
                  </Button>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Current: <Badge className={settings.trading_mode === 'LIVE' ? 'bg-red-600' : 'bg-blue-600'}>
                    {settings.trading_mode}
                  </Badge>
                </p>
              </div>

              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-3">Upstox Integration</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                    <input
                      type="text"
                      value={settings.broker.api_key}
                      onChange={(e) => updateField('broker', 'api_key', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter Upstox API Key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Secret</label>
                    <input
                      type="password"
                      value={settings.broker.api_secret}
                      onChange={(e) => updateField('broker', 'api_secret', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter Upstox API Secret"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Redirect URI
                      <span className="text-xs text-gray-500 ml-2">(Where to get? See below 👇)</span>
                    </label>
                    <input
                      type="text"
                      value={settings.broker.redirect_uri}
                      onChange={(e) => updateField('broker', 'redirect_uri', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="https://yourapp.com/callback"
                    />
                  </div>
                  
                  {/* Redirect URI Guide */}
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h4 className="font-semibold text-gray-800 mb-2">📍 How to Get Redirect URI?</h4>
                    <div className="text-sm text-gray-700 space-y-2">
                      <p><strong>Option 1: Use Your Domain (if you have)</strong></p>
                      <code className="block bg-white p-2 rounded border text-xs">
                        https://yourdomain.com/callback
                      </code>
                      
                      <p className="mt-3"><strong>Option 2: Use localhost (for testing)</strong></p>
                      <code className="block bg-white p-2 rounded border text-xs">
                        http://localhost:3000/callback
                      </code>
                      
                      <p className="mt-3"><strong>Option 3: Use Current Bot URL</strong></p>
                      <code className="block bg-white p-2 rounded border text-xs">
                        {window.location.origin}/callback
                      </code>
                      <button
                        onClick={() => {
                          updateField('broker', 'redirect_uri', `${window.location.origin}/callback`);
                          alert('✅ Current URL copied to Redirect URI!');
                        }}
                        className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                      >
                        📋 Use Current URL
                      </button>
                      
                      <div className="mt-3 p-3 bg-yellow-50 rounded border border-yellow-200">
                        <p className="font-semibold text-yellow-800">⚠️ Important Steps:</p>
                        <ol className="list-decimal ml-4 mt-1 space-y-1 text-xs text-yellow-900">
                          <li>Go to <a href="https://api.upstox.com" target="_blank" rel="noreferrer" className="underline">Upstox Developer Portal</a></li>
                          <li>Create/Edit your app</li>
                          <li>Add your Redirect URI in app settings</li>
                          <li>Copy the SAME URI here</li>
                          <li>Both must match exactly!</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-xs text-gray-500">
                    Get API credentials from <a href="https://api.upstox.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">Upstox Developer Portal</a>
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Risk Tab */}
            <TabsContent value="risk" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Initial Capital (₹)</label>
                  <input
                    type="number"
                    value={settings.risk.initial_capital}
                    onChange={(e) => updateField('risk', 'initial_capital', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    min="10000"
                    step="10000"
                  />
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Daily Limit (₹)</label>
                  <input
                    type="number"
                    value={settings.risk.daily_limit}
                    onChange={(e) => updateField('risk', 'daily_limit', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    min="10000"
                    step="10000"
                  />
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Per Trade (₹)</label>
                  <input
                    type="number"
                    value={settings.risk.max_per_trade}
                    onChange={(e) => updateField('risk', 'max_per_trade', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    min="1000"
                    step="1000"
                  />
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Risk Tolerance</label>
                  <select
                    value={settings.risk.risk_tolerance}
                    onChange={(e) => updateField('risk', 'risk_tolerance', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="low">Low (15% SL, 30% Target)</option>
                    <option value="medium">Medium (25% SL, 50% Target)</option>
                    <option value="high">High (35% SL, 70% Target)</option>
                  </select>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stop Loss (%)</label>
                  <input
                    type="number"
                    value={settings.risk.stop_loss_pct}
                    onChange={(e) => updateField('risk', 'stop_loss_pct', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    min="5"
                    max="50"
                  />
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Profit (%)</label>
                  <input
                    type="number"
                    value={settings.risk.target_pct}
                    onChange={(e) => updateField('risk', 'target_pct', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    min="5"
                    max="100"
                  />
                </div>
              </div>
            </TabsContent>

            {/* Schedule Tab */}
            <TabsContent value="schedule" className="space-y-4">
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">Trading Schedule</h3>
                  <Button
                    onClick={() => updateField('schedule', 'enabled', !settings.schedule.enabled)}
                    className={settings.schedule.enabled ? 'bg-green-600' : 'bg-gray-400'}
                  >
                    {settings.schedule.enabled ? '✅ Enabled' : '⏸️ Disabled'}
                  </Button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Trading Days</label>
                    <div className="flex flex-wrap gap-2">
                      {weekDays.map(day => (
                        <Button
                          key={day}
                          onClick={() => toggleDay(day)}
                          className={settings.schedule.trading_days?.includes(day) ? 'bg-blue-600' : 'bg-gray-300 text-gray-700'}
                          size="sm"
                        >
                          {day.slice(0, 3)}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Selected: {settings.schedule.trading_days?.join(', ') || 'None'}
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={settings.schedule.start_time}
                        onChange={(e) => updateField('schedule', 'start_time', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                      <input
                        type="time"
                        value={settings.schedule.end_time}
                        onChange={(e) => updateField('schedule', 'end_time', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                    <p className="text-sm text-gray-700">
                      💡 <strong>Note:</strong> Bot will only trade during selected days and times. Outside these hours, auto-analysis and trading will be paused.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Advanced Tab */}
            <TabsContent value="advanced" className="space-y-4">
              {/* AI Model Settings */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-lg border border-purple-200">
                <h3 className="font-bold text-gray-800 mb-3">🤖 AI Model Configuration</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Emergent LLM Key (Universal Key)
                    </label>
                    <input
                      type="password"
                      value={settings.ai?.emergent_llm_key || 'sk-emergent-754BdB27f511c159cC'}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                      placeholder="Emergent Universal Key"
                    />
                    <p className="text-xs text-green-600 mt-1">
                      ✅ Pre-configured for you! Supports OpenAI, Claude, Gemini
                    </p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded border border-blue-200">
                    <p className="text-sm text-gray-700">
                      <strong>💡 What is Emergent LLM Key?</strong><br/>
                      A single universal key that works with OpenAI GPT, Claude, and Gemini models. 
                      No need for separate API keys!
                    </p>
                    <p className="text-xs text-gray-600 mt-2">
                      Currently using: <Badge className="bg-blue-600">GPT-4.1-mini</Badge> for news sentiment analysis
                    </p>
                  </div>
                </div>
              </div>

              {/* News Sources Settings */}
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-3">📰 News Source Configuration</h3>
                
                <div className="space-y-4">
                  {/* Current Source Display */}
                  <div className="bg-blue-50 p-3 rounded border border-blue-200">
                    <p className="text-sm font-semibold text-gray-800">Current Mode:</p>
                    <Badge className="bg-blue-600 mt-1">
                      {settings.news.sources?.includes('newsapi') ? 'NewsAPI (Premium)' :
                       settings.news.sources?.includes('alphavantage') ? 'Alpha Vantage (Premium)' :
                       'Demo News (Free)'}
                    </Badge>
                  </div>

                  {/* News Source Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select News Source
                    </label>
                    <select
                      value={settings.news.sources?.[0] || 'demo'}
                      onChange={(e) => {
                        const newSources = [e.target.value];
                        updateField('news', 'sources', newSources);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="demo">Demo News (Free - For Testing)</option>
                      <option value="newsapi">NewsAPI.org (Premium - Real Market News)</option>
                      <option value="alphavantage">Alpha Vantage (Premium - Financial Data)</option>
                    </select>
                  </div>

                  {/* NewsAPI Configuration */}
                  <div className="border-l-4 border-green-500 pl-4">
                    <h4 className="font-semibold text-gray-800 mb-2">📈 NewsAPI.org (Premium)</h4>
                    <input
                      type="text"
                      value={settings.news.newsapi_key}
                      onChange={(e) => updateField('news', 'newsapi_key', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2"
                      placeholder="Enter NewsAPI.org key"
                    />
                    <div className="text-xs text-gray-600 space-y-1">
                      <p>• Get from: <a href="https://newsapi.org" target="_blank" rel="noreferrer" className="text-blue-600 underline">newsapi.org</a></p>
                      <p>• Free tier: 100 requests/day</p>
                      <p>• Pro: $449/month (100K requests)</p>
                      <p>• Sources: Reuters, Bloomberg, Financial Times, etc.</p>
                    </div>
                  </div>

                  {/* Alpha Vantage Configuration */}
                  <div className="border-l-4 border-purple-500 pl-4">
                    <h4 className="font-semibold text-gray-800 mb-2">📊 Alpha Vantage (Premium)</h4>
                    <input
                      type="text"
                      value={settings.news.alphavantage_key}
                      onChange={(e) => updateField('news', 'alphavantage_key', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2"
                      placeholder="Enter Alpha Vantage key"
                    />
                    <div className="text-xs text-gray-600 space-y-1">
                      <p>• Get from: <a href="https://www.alphavantage.co" target="_blank" rel="noreferrer" className="text-blue-600 underline">alphavantage.co</a></p>
                      <p>• Free tier: 500 calls/day</p>
                      <p>• Premium: $49.99/month</p>
                      <p>• Data: Stock news, market sentiment, financial reports</p>
                    </div>
                  </div>

                  {/* Minimum Confidence */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Minimum Confidence for Trading (%)
                    </label>
                    <input
                      type="number"
                      value={settings.news.min_confidence}
                      onChange={(e) => updateField('news', 'min_confidence', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      min="50"
                      max="95"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Only trade on signals with confidence ≥ this value (Current: {settings.news.min_confidence}%)
                    </p>
                  </div>
                </div>
              </div>

              {/* Auto-Trading Controls */}
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-3">⚙️ Auto-Trading Controls</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-800">Auto-Exit</p>
                      <p className="text-xs text-gray-600">Automatically close trades at target/SL</p>
                    </div>
                    <Button
                      onClick={() => updateField('auto_trading', 'auto_exit', !settings.auto_trading.auto_exit)}
                      className={settings.auto_trading.auto_exit ? 'bg-green-600' : 'bg-gray-400'}
                    >
                      {settings.auto_trading.auto_exit ? 'ON' : 'OFF'}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-800">Auto-Entry</p>
                      <p className="text-xs text-gray-600">Open new trade after profitable exit</p>
                    </div>
                    <Button
                      onClick={() => updateField('auto_trading', 'auto_entry', !settings.auto_trading.auto_entry)}
                      className={settings.auto_trading.auto_entry ? 'bg-green-600' : 'bg-gray-400'}
                    >
                      {settings.auto_trading.auto_entry ? 'ON' : 'OFF'}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-800">Auto-Analysis</p>
                      <p className="text-xs text-gray-600">Automatic news analysis</p>
                    </div>
                    <Button
                      onClick={() => updateField('auto_trading', 'auto_analysis', !settings.auto_trading.auto_analysis)}
                      className={settings.auto_trading.auto_analysis ? 'bg-green-600' : 'bg-gray-400'}
                    >
                      {settings.auto_trading.auto_analysis ? 'ON' : 'OFF'}
                    </Button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Analysis Interval (minutes)
                    </label>
                    <input
                      type="number"
                      value={settings.auto_trading.analysis_interval_minutes}
                      onChange={(e) => updateField('auto_trading', 'analysis_interval_minutes', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      min="1"
                      max="60"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      How often to analyze news (Current: every {settings.auto_trading.analysis_interval_minutes} minutes)
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Save Button */}
          <div className="mt-6 flex gap-3 justify-end">
            <Button onClick={onClose} variant="outline" className="border-gray-300">
              Cancel
            </Button>
            <Button 
              onClick={saveSettings} 
              disabled={saving}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {saving ? 'Saving...' : '💾 Save Settings'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
