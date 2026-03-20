import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FaChartLine, FaSignOutAlt, FaCircle } from 'react-icons/fa';

export default function TradesList({ trades, formatCurrency, formatTime, tradingMode, brokerConnected, onManualExit }) {
  const isLiveMode = tradingMode === 'LIVE';
  const [exitingId, setExitingId] = useState(null);
  const [pulse, setPulse] = useState(false);

  // Pulse animation on every trade update (live refresh indicator)
  useEffect(() => {
    if (trades.length > 0) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 300);
      return () => clearTimeout(t);
    }
  }, [trades]);

  const handleExit = async (trade) => {
    if (!window.confirm(`Are you sure you want to exit this position?\n${trade.symbol} | Qty: ${trade.quantity}`)) return;
    setExitingId(trade.instrument_token || trade.id);
    try {
      if (onManualExit) await onManualExit(trade);
    } finally {
      setExitingId(null);
    }
  };

  if (trades.length === 0) {
    return (
      <Card className="bg-white border-gray-200 p-8 text-center shadow-md" data-testid="no-trades-message">
        <FaChartLine className="text-5xl text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 font-medium">
          {isLiveMode && !brokerConnected
            ? 'Upstox not connected. Go to Settings > Broker to connect.'
            : isLiveMode
            ? 'No active positions on Upstox'
            : 'No active trades'}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Live Refresh Indicator */}
      {trades.length > 0 && (
        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2" data-testid="live-refresh-banner">
          <div className="flex items-center gap-2 text-sm">
            <FaCircle className={`text-xs ${pulse ? 'text-green-500' : 'text-green-400'} ${pulse ? 'animate-ping' : ''}`} style={{ fontSize: '8px' }} />
            <span className="text-gray-600 font-medium">Live P&L</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-500 text-xs">Auto-refresh every 1s</span>
          </div>
          <Badge variant="outline" className="text-xs border-green-300 text-green-700">
            {trades.length} position{trades.length > 1 ? 's' : ''}
          </Badge>
        </div>
      )}
      {isLiveMode && brokerConnected && trades[0]?.isLive && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-sm text-green-800 font-medium" data-testid="live-trades-banner">
          Showing live positions from Upstox
        </div>
      )}
      {trades.map((trade, idx) => {
        const isExiting = exitingId === (trade.instrument_token || trade.id);
        return (
          <Card key={idx} className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid={`trade-${idx}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Badge className={trade.trade_type === 'CALL' || trade.trade_type === 'BUY' ? 'bg-green-600' : 'bg-red-600'}>
                  {trade.trade_type}
                </Badge>
                <span className="font-semibold text-lg text-gray-800">{trade.symbol}</span>
                <Badge variant="outline" className="border-gray-400 text-gray-700">Qty: {trade.quantity}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold"
                  disabled={isExiting}
                  onClick={() => handleExit(trade)}
                  data-testid={`manual-exit-btn-${idx}`}
                >
                  <FaSignOutAlt className="mr-1" />
                  {isExiting ? 'Exiting...' : 'Exit'}
                </Button>
                <Badge className="bg-blue-600">{trade.status}</Badge>
              </div>
            </div>

            {/* Live P&L Section */}
            {trade.current_price > 0 && (
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
                    <p className={`text-2xl font-bold transition-all duration-300 ${trade.live_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {trade.live_pnl >= 0 ? '+' : ''}{formatCurrency(trade.live_pnl)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 font-medium">P&L %</p>
                    <p className={`text-2xl font-bold transition-all duration-300 ${trade.pnl_percentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {trade.pnl_percentage >= 0 ? '+' : ''}{(trade.pnl_percentage || 0).toFixed(2)}%
                    </p>
                  </div>
                </div>

                {/* Progress to Target/Stop Loss */}
                {trade.stop_loss > 0 && trade.target > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span className="text-red-600 font-medium">SL: {formatCurrency(trade.stop_loss)}</span>
                      <span className={`font-bold ${trade.live_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {trade.live_pnl >= 0 ? 'In Profit' : 'In Loss'}
                      </span>
                      <span className="text-green-600 font-medium">Target: {formatCurrency(trade.target)}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden relative">
                      <div className="absolute left-0 top-0 bottom-0 w-px bg-red-500" />
                      <div
                        className={`h-full ${trade.live_pnl >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{
                          width: `${Math.min(Math.max(((trade.current_price - trade.stop_loss) / (trade.target - trade.stop_loss)) * 100, 0), 100)}%`
                        }}
                      />
                      <div className="absolute right-0 top-0 bottom-0 w-px bg-green-500" />
                    </div>
                  </div>
                )}
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
            <p className="text-xs text-gray-500 mt-3">Entry: {formatTime(trade.entry_time)}</p>
          </Card>
        );
      })}
    </div>
  );
}
