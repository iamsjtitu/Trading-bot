import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FaBullseye } from 'react-icons/fa';

export default function SignalsList({ signals, formatCurrency, formatTime, tradingMode, upstoxConnected }) {
  const isLiveMode = tradingMode === 'LIVE';

  const getSentimentColor = (sentiment) => {
    if (!sentiment) return 'bg-gray-500';
    const s = sentiment.toUpperCase();
    if (s === 'BULLISH') return 'bg-green-500';
    if (s === 'BEARISH') return 'bg-red-500';
    return 'bg-yellow-500';
  };

  if (signals.length === 0) {
    return (
      <Card className="bg-white border-gray-200 p-8 text-center shadow-md" data-testid="no-signals-message">
        <FaBullseye className="text-5xl text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 font-medium">No trading signals generated yet</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {isLiveMode && (
        <div className={`border rounded-lg p-3 text-sm font-medium ${upstoxConnected ? 'bg-green-50 border-green-300 text-green-800' : 'bg-yellow-50 border-yellow-300 text-yellow-800'}`} data-testid="signals-mode-banner">
          {upstoxConnected
            ? 'LIVE MODE: AI signals will execute real trades on Upstox'
            : 'LIVE MODE: Connect Upstox in Settings to execute trades'}
        </div>
      )}
      {signals.map((signal, idx) => (
        <Card key={idx} className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid={`signal-${idx}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Badge className={signal.signal_type === 'CALL' ? 'bg-green-600' : 'bg-red-600'}>
                {signal.signal_type === 'CALL' ? 'CALL' : 'PUT'}
              </Badge>
              <span className="font-semibold text-lg text-gray-800">{signal.symbol}</span>
              <Badge variant="outline" className="border-gray-400 text-gray-700">Strike: {signal.strike_price}</Badge>
            </div>
            <Badge className={getSentimentColor(signal.sentiment)}>
              {signal.confidence}% Confident
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-600 font-medium">Entry Price</p>
              <p className="font-semibold text-gray-900">{formatCurrency(signal.entry_price)}</p>
            </div>
            <div>
              <p className="text-gray-600 font-medium">Target</p>
              <p className="font-semibold text-green-600">{formatCurrency(signal.target)}</p>
            </div>
            <div>
              <p className="text-gray-600 font-medium">Stop Loss</p>
              <p className="font-semibold text-red-600">{formatCurrency(signal.stop_loss)}</p>
            </div>
            <div>
              <p className="text-gray-600 font-medium">Investment</p>
              <p className="font-semibold text-gray-900">{formatCurrency(signal.investment_amount)}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-3 italic bg-gray-50 p-2 rounded">{signal.reason}</p>
          <p className="text-xs text-gray-500 mt-2">Generated: {formatTime(signal.created_at)}</p>
        </Card>
      ))}
    </div>
  );
}
