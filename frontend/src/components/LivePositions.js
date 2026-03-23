export default function LivePositions({ trades, tradingMode, brokerConnected, formatCurrency }) {
  if (tradingMode !== 'LIVE' || !brokerConnected || trades.length === 0) return null;

  return (
    <div className="mt-6">
      <h2 className="text-lg font-bold text-gray-800 mb-3" data-testid="live-positions-title">Live Positions</h2>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-md">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Symbol</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Qty</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Entry Price</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">LTP</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">P&L</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">P&L %</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, idx) => (
              <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`live-position-${idx}`}>
                <td className="px-4 py-3 font-medium text-gray-900">{t.symbol}</td>
                <td className="px-4 py-3 text-right text-gray-900">{t.quantity}</td>
                <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(t.entry_price)}</td>
                <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(t.current_price)}</td>
                <td className={`px-4 py-3 text-right font-bold ${t.live_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {t.live_pnl >= 0 ? '+' : ''}{formatCurrency(t.live_pnl)}
                </td>
                <td className={`px-4 py-3 text-right font-bold ${t.pnl_percentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {t.pnl_percentage >= 0 ? '+' : ''}{(t.pnl_percentage || 0).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
