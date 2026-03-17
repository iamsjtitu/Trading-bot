import { Card } from '@/components/ui/card';
import { FaCalculator } from 'react-icons/fa';

export default function PositionCalculator({ riskMetrics, formatCurrency }) {
  const calculatePositionSize = (confidence) => {
    const baseSize = riskMetrics.maxPerTrade;
    const confidenceMultiplier = confidence / 100;
    return Math.floor(baseSize * confidenceMultiplier);
  };

  return (
    <Card className="bg-white border-gray-200 p-6 shadow-md" data-testid="position-calculator">
      <div className="flex items-center gap-3 mb-6">
        <FaCalculator className="text-3xl text-blue-600" />
        <div>
          <h2 className="text-xl font-bold text-gray-800">Position Size Calculator</h2>
          <p className="text-sm text-gray-600">Calculate optimal position size based on confidence</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Signal Confidence (%)
            </label>
            <input
              type="range"
              min="60"
              max="100"
              defaultValue="80"
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              onChange={(e) => {
                const conf = parseInt(e.target.value);
                document.getElementById('conf-value').textContent = conf;
                document.getElementById('calc-size').textContent = formatCurrency(calculatePositionSize(conf));
              }}
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>60%</span>
              <span id="conf-value" className="font-bold text-blue-600">80%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-gray-600 mb-1">Calculated Position Size</p>
            <p id="calc-size" className="text-3xl font-bold text-blue-600">
              {formatCurrency(calculatePositionSize(80))}
            </p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-3">Risk Parameters</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Max Per Trade:</span>
                <span className="font-semibold">{formatCurrency(riskMetrics.maxPerTrade)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Stop Loss:</span>
                <span className="font-semibold text-red-600">25%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Target Profit:</span>
                <span className="font-semibold text-green-600">50%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Risk/Reward:</span>
                <span className="font-semibold">1:2</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-gradient-to-br from-green-50 to-blue-50 p-4 rounded-lg border border-green-200">
            <h3 className="font-semibold text-gray-800 mb-3">Position Sizing Logic</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">+</span>
                <span><strong>High Confidence (80-100%):</strong> Full position size up to {formatCurrency(riskMetrics.maxPerTrade)}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-600 font-bold">~</span>
                <span><strong>Medium Confidence (60-79%):</strong> Reduced position size</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-600 font-bold">-</span>
                <span><strong>Low Confidence (&lt;60%):</strong> No trade executed</span>
              </li>
            </ul>
          </div>

          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <h3 className="font-semibold text-gray-800 mb-3">Risk Warnings</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span>-</span>
                <span>Daily limit: {formatCurrency(riskMetrics.dailyLimit)}</span>
              </li>
              <li className="flex items-start gap-2">
                <span>-</span>
                <span>Daily used: {formatCurrency(riskMetrics.dailyUsed)} ({((riskMetrics.dailyUsed / riskMetrics.dailyLimit) * 100).toFixed(1)}%)</span>
              </li>
              <li className="flex items-start gap-2">
                <span>-</span>
                <span>Remaining: {formatCurrency(riskMetrics.dailyLimit - riskMetrics.dailyUsed)}</span>
              </li>
              {riskMetrics.dailyUsed / riskMetrics.dailyLimit > 0.8 && (
                <li className="flex items-start gap-2 text-red-600 font-semibold">
                  <span>!</span>
                  <span>WARNING: 80% of daily limit reached!</span>
                </li>
              )}
            </ul>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
            <h3 className="font-semibold text-gray-800 mb-2">Today's Summary</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-600">Trades</p>
                <p className="text-xl font-bold text-gray-900">{riskMetrics.todayTrades}</p>
              </div>
              <div>
                <p className="text-gray-600">P&L</p>
                <p className={`text-xl font-bold ${riskMetrics.todayPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(riskMetrics.todayPnL)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
