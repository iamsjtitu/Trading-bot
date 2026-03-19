import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function AutoTradingSettings({ autoSettings, showAutoSettings, setShowAutoSettings, updateAutoSettings, onDebug, onExecuteSignal, debugResult }) {
  return (
    <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 p-4 mb-6 shadow-lg" data-testid="auto-trading-settings">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setShowAutoSettings(!showAutoSettings)}
      >
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          Auto-Trading Settings
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
                {autoSettings.auto_exit ? 'ON' : 'OFF'}
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
                {autoSettings.auto_entry ? 'ON' : 'OFF'}
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
              <strong>How it works:</strong> When auto-exit is ON, trades automatically close when they hit your target profit ({autoSettings.target_pct}%) or stop-loss ({autoSettings.stoploss_pct}%).
              {autoSettings.auto_entry && ' With auto-entry ON, a new trade will open automatically after a profitable exit.'}
            </p>
          </div>

          <div className="md:col-span-2 flex gap-3">
            <Button onClick={onDebug} className="bg-orange-600 hover:bg-orange-700 text-white" data-testid="debug-auto-trade">
              Debug Auto-Trade
            </Button>
            <Button onClick={onExecuteSignal} className="bg-purple-600 hover:bg-purple-700 text-white" data-testid="execute-signal-btn">
              Execute Latest Signal
            </Button>
          </div>

          {debugResult && (
            <div className="md:col-span-2 p-3 bg-gray-900 rounded-lg text-xs font-mono text-green-400 max-h-64 overflow-auto" data-testid="debug-result">
              <p className="text-white font-bold mb-2">Auto-Trade Debug (v{debugResult.version}): {debugResult.all_ok ? '✅ ALL OK' : '❌ ISSUES FOUND'}</p>
              {debugResult.steps?.map((s, i) => (
                <div key={i} className="mb-1">
                  <span className={s.ok ? 'text-green-400' : 'text-red-400'}>
                    {s.ok ? '✅' : '❌'} Step {s.step}: {s.name} = {typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value)}
                  </span>
                  {s.sample_call_key && <div className="ml-4 text-gray-400">Call: {s.sample_call_key}</div>}
                  {s.sample_put_key && <div className="ml-4 text-gray-400">Put: {s.sample_put_key}</div>}
                  {s.trades && s.trades.length > 0 && (
                    <div className="ml-4">
                      {s.trades.map((t, j) => (
                        <div key={j} className={t.status === 'FAILED' ? 'text-red-400' : 'text-green-400'}>
                          {t.status} | {t.type} {t.symbol} | {t.error || t.time}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fix Trade Data Button */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <button
          onClick={async () => {
            try {
              const r = await axios.post(`${API}/trades/cleanup`);
              alert(r.data.message || 'Cleanup complete');
            } catch (e) {
              alert('Cleanup failed: ' + e.message);
            }
          }}
          className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium text-sm"
          data-testid="fix-trade-data-btn"
        >
          Fix Trade Data (Sync with Upstox)
        </button>
        <p className="text-xs text-gray-500 mt-1">Fixes entry prices and P&L using actual Upstox order data</p>
      </div>
    </Card>
  );
}
