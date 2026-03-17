import { Badge } from '@/components/ui/badge';

export default function MarketTicker({ marketIndices }) {
  const indices = [
    { key: 'nifty50', label: 'NIFTY 50' },
    { key: 'sensex', label: 'SENSEX' },
    { key: 'banknifty', label: 'BANK NIFTY' },
    { key: 'finnifty', label: 'FIN NIFTY' },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md p-3 mb-4 overflow-hidden" data-testid="market-ticker">
      <div className="flex items-center gap-6 overflow-x-auto">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-600">LIVE MARKET:</span>
        </div>
        {indices.map(({ key, label }) => {
          const data = marketIndices[key];
          if (!data) return null;
          return (
            <div key={key} className="flex items-center gap-2 border-l border-gray-300 pl-4 flex-shrink-0">
              <div>
                <p className="text-xs text-gray-600 font-medium">{label}</p>
                <p className="text-sm font-bold text-gray-900">{data.value.toFixed(2)}</p>
              </div>
              <div className={`text-xs font-semibold ${data.changePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {data.changePct >= 0 ? '▲' : '▼'} {Math.abs(data.changePct).toFixed(2)}%
              </div>
            </div>
          );
        })}
        <div className="flex items-center gap-2 border-l border-gray-300 pl-4 flex-shrink-0">
          <span className="text-xs text-gray-500 italic">Updating every 3 sec</span>
        </div>
      </div>
    </div>
  );
}
