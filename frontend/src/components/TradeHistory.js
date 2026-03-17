import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function TradeHistory({ orders, formatCurrency }) {
  if (!orders || orders.length === 0) {
    return (
      <Card className="bg-white border-gray-200 p-8 text-center shadow-md" data-testid="no-history-message">
        <p className="text-gray-600 font-medium">No trade history available</p>
        <p className="text-sm text-gray-500 mt-2">Trades from Upstox will appear here when connected in LIVE mode</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-md">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Symbol</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Type</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Qty</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Price</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Avg Price</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Time</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, idx) => (
              <tr key={order.order_id || idx} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`history-row-${idx}`}>
                <td className="px-4 py-3 font-medium text-gray-900">{order.symbol}</td>
                <td className="px-4 py-3">
                  <Badge className={order.transaction_type === 'BUY' ? 'bg-green-600' : 'bg-red-600'}>
                    {order.transaction_type}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right text-gray-900">{order.quantity}</td>
                <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(order.price || 0)}</td>
                <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(order.average_price || 0)}</td>
                <td className="px-4 py-3 text-center">
                  <Badge className={
                    order.status === 'complete' ? 'bg-green-600' :
                    order.status === 'rejected' ? 'bg-red-600' :
                    order.status === 'cancelled' ? 'bg-gray-500' :
                    'bg-yellow-600'
                  }>
                    {order.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{order.placed_at || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
