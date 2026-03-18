import { Badge } from '@/components/ui/badge';

function isMarketOpen() {
  const now = new Date();
  const istOffset = 5.5 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMinutes = utcMinutes + istOffset;
  const istHour = Math.floor((istMinutes % 1440) / 60);
  const istMin = istMinutes % 60;
  const day = now.getUTCDay();
  const istDay = (istMinutes >= 1440) ? (day + 1) % 7 : day;

  // Market open: Mon-Fri, 9:15 AM - 3:30 PM IST
  if (istDay === 0 || istDay === 6) return false; // Sat/Sun
  const timeInMin = istHour * 60 + istMin;
  return timeInMin >= 555 && timeInMin <= 930; // 9:15=555, 15:30=930
}

export default function MarketTicker({ marketIndices, tradingMode, upstoxConnected }) {
  const indices = [
    { key: 'nifty50', label: 'NIFTY 50' },
    { key: 'sensex', label: 'SENSEX' },
    { key: 'banknifty', label: 'BANK NIFTY' },
    { key: 'finnifty', label: 'FIN NIFTY' },
  ];

  const timeBasedOpen = isMarketOpen();
  // In LIVE mode with Upstox connected, treat market as live
  const marketOpen = (tradingMode === 'LIVE' && upstoxConnected) || timeBasedOpen;

  return (
    <div className={`border rounded-lg shadow-md p-3 mb-4 overflow-hidden ${marketOpen ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-300'}`} data-testid="market-ticker">
      <div className="flex items-center gap-6 overflow-x-auto">
        <div className="flex items-center gap-2 flex-shrink-0">
          {marketOpen ? (
            <Badge className="bg-green-600 text-white text-xs" data-testid="market-status-badge">LIVE MARKET</Badge>
          ) : (
            <Badge className="bg-gray-500 text-white text-xs" data-testid="market-status-badge">MARKET CLOSED</Badge>
          )}
        </div>
        {indices.map(({ key, label }) => {
          const data = marketIndices[key];
          if (!data) return null;
          return (
            <div key={key} className="flex items-center gap-2 border-l border-gray-300 pl-4 flex-shrink-0">
              <div>
                <p className="text-xs text-gray-600 font-medium">{label}</p>
                <p className={`text-sm font-bold ${marketOpen ? 'text-gray-900' : 'text-gray-500'}`}>{data.value.toFixed(2)}</p>
              </div>
              <div className={`text-xs font-semibold ${data.changePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {data.changePct >= 0 ? '▲' : '▼'} {Math.abs(data.changePct).toFixed(2)}%
              </div>
            </div>
          );
        })}
        <div className="flex items-center gap-2 border-l border-gray-300 pl-4 flex-shrink-0">
          <span className="text-xs text-gray-500 italic">
            {tradingMode === 'LIVE' && upstoxConnected
              ? 'Live data from Upstox'
              : marketOpen ? 'Updating every 1 sec' : 'Market hours: 9:15 AM - 3:30 PM IST'}
          </span>
        </div>
      </div>
    </div>
  );
}
