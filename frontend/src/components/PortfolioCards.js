import { FaChartLine, FaBullseye, FaWallet } from 'react-icons/fa';
import { Card } from '@/components/ui/card';

export default function PortfolioCards({ displayPortfolio, stats, tradingMode, formatCurrency }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="portfolio-value-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 font-medium">Portfolio Value</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(displayPortfolio?.current_value || 0)}</p>
            {displayPortfolio?.isLive && <p className="text-xs text-green-600 mt-1">Live from Broker</p>}
            {displayPortfolio?.isDisconnected && <p className="text-xs text-yellow-600 mt-1">Connect Broker for live data</p>}
          </div>
          <FaWallet className="text-3xl text-blue-500" />
        </div>
      </Card>
      <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="total-pnl-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 font-medium">Total P&L</p>
            <p className={`text-2xl font-bold ${(displayPortfolio?.total_pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(displayPortfolio?.total_pnl || 0)}
            </p>
            {displayPortfolio?.isLive && <p className="text-xs text-green-600 mt-1">Live from Broker</p>}
            {displayPortfolio?.isDisconnected && <p className="text-xs text-yellow-600 mt-1">Connect Broker for live data</p>}
          </div>
          <FaChartLine className="text-3xl text-green-500" />
        </div>
      </Card>
      <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="active-positions-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 font-medium">Active Positions</p>
            <p className="text-2xl font-bold text-gray-900">{displayPortfolio?.active_positions || 0}</p>
            {displayPortfolio?.isLive && <p className="text-xs text-green-600 mt-1">Live from Broker</p>}
            {displayPortfolio?.isDisconnected && <p className="text-xs text-yellow-600 mt-1">Connect Broker for live data</p>}
          </div>
          <FaBullseye className="text-3xl text-purple-500" />
        </div>
      </Card>
      <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="win-rate-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 font-medium">{displayPortfolio?.isLive ? 'Orders Today' : 'Win Rate'}</p>
            <p className="text-2xl font-bold text-gray-900">
              {displayPortfolio?.isLive ? (displayPortfolio?.total_trades || 0) : displayPortfolio?.isDisconnected ? '--' : `${stats?.win_rate?.toFixed(1) || 0}%`}
            </p>
            {displayPortfolio?.isLive && <p className="text-xs text-green-600 mt-1">Live from Broker</p>}
            {displayPortfolio?.isDisconnected && <p className="text-xs text-yellow-600 mt-1">Connect Broker for live data</p>}
          </div>
          <FaBullseye className="text-3xl text-yellow-500" />
        </div>
      </Card>
    </div>
  );
}
