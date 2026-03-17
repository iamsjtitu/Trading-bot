import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function AutoTradingSettings({ autoSettings, showAutoSettings, setShowAutoSettings, updateAutoSettings }) {
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
        </div>
      )}
    </Card>
  );
}
