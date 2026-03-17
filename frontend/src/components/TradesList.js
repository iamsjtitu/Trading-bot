import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FaChartLine } from 'react-icons/fa';

export default function TradesList({ trades, formatCurrency, formatTime }) {
  if (trades.length === 0) {
    return (
      <Card className="bg-white border-gray-200 p-8 text-center shadow-md" data-testid="no-trades-message">
        <FaChartLine className="text-5xl text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 font-medium">No active trades</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {trades.map((trade, idx) => (
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
      ))}
    </div>
  );
}
