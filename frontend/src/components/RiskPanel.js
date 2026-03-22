import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function RiskPanel({ riskMetrics, emergencyStop, onEmergencyStop, formatCurrency, tradingMode, brokerConnected, stoploss_pct }) {
  const isLive = riskMetrics?.isLive || false;
  const isLiveDisconnected = tradingMode === 'LIVE' && !brokerConnected;
  const sl = stoploss_pct ?? 25;
  const riskLabel = sl <= 5 ? 'Low Risk' : sl <= 15 ? 'Medium Risk' : 'High Risk';

  return (
    <Card className="bg-gradient-to-r from-orange-50 to-red-50 border-orange-200 p-4 mb-4 shadow-lg" data-testid="risk-management-panel">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            Risk Management
            {emergencyStop && <Badge className="bg-red-600">STOPPED</Badge>}
            {isLive && <Badge className="bg-green-600 text-xs" data-testid="risk-live-badge">LIVE</Badge>}
            {isLiveDisconnected && <Badge className="bg-yellow-600 text-xs" data-testid="risk-disconnected-badge">BROKER NOT CONNECTED</Badge>}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-gray-600 font-medium">{isLive ? 'Margin Used' : 'Daily Used'}</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(riskMetrics.dailyUsed)}</p>
              {!isLive && <p className="text-xs text-gray-500">of {formatCurrency(riskMetrics.dailyLimit)}</p>}
              {isLive && <p className="text-xs text-green-600">Live from Broker</p>}
              {!isLive && (
                <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${riskMetrics.dailyUsed / riskMetrics.dailyLimit > 0.8 ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min((riskMetrics.dailyUsed / riskMetrics.dailyLimit) * 100, 100)}%` }}
                  />
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-600 font-medium">Max Per Trade</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(riskMetrics.maxPerTrade)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 font-medium">{isLive ? 'Orders Today' : "Today's Trades"}</p>
              <p className="text-lg font-bold text-gray-900">{riskMetrics.todayTrades}</p>
              {isLive && <p className="text-xs text-green-600">Live from Broker</p>}
            </div>
            <div>
              <p className="text-xs text-gray-600 font-medium">Today's P&L</p>
              <p className={`text-lg font-bold ${riskMetrics.todayPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(riskMetrics.todayPnL)}
              </p>
              {isLive && <p className="text-xs text-green-600">Live from Broker</p>}
            </div>
            <div>
              <p className="text-xs text-gray-600 font-medium">Stop Loss</p>
              <p className="text-lg font-bold text-orange-600" data-testid="risk-stoploss-value">{sl}%</p>
              <p className="text-xs text-gray-500">{riskLabel}</p>
            </div>
          </div>
        </div>
        <div className="ml-6">
          <Button
            onClick={onEmergencyStop}
            className={emergencyStop
              ? "bg-green-600 hover:bg-green-700 text-white text-lg px-6 py-6 shadow-xl"
              : "bg-red-600 hover:bg-red-700 text-white text-lg px-6 py-6 shadow-xl animate-pulse"}
            data-testid="emergency-stop-button"
          >
            {emergencyStop ? 'Resume' : 'STOP'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
