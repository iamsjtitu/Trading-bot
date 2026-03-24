import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = (() => {
  const envUrl = process.env.REACT_APP_BACKEND_URL || '';
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) return '';
  return envUrl;
})();
const API = `${BACKEND_URL}/api`;

export default function QuickTrade({ tradingMode, brokerConnected, formatCurrency, onTradeExecuted }) {
  const [executing, setExecuting] = useState(null);
  const [instrument, setInstrument] = useState('NIFTY50');
  const [riskSettings, setRiskSettings] = useState({});

  useEffect(() => {
    axios.get(`${API}/settings`).then(res => {
      if (res.data.status === 'success') {
        setInstrument(res.data.settings?.trading_instrument || 'NIFTY50');
        setRiskSettings(res.data.settings?.risk || {});
      }
    }).catch(() => {});
  }, []);

  const isLiveMode = tradingMode === 'LIVE';

  const handleDirectTrade = async (type) => {
    const confirmMsg = isLiveMode
      ? `LIVE ${type} Trade on ${instrument}?\n\nThis will place a REAL order on Upstox!`
      : `Paper ${type} Trade on ${instrument}?`;
    if (!window.confirm(confirmMsg)) return;

    setExecuting(type);
    try {
      const res = await axios.post(`${API}/trades/direct`, { trade_type: type });
      if (res.data.status === 'success') {
        toast.success(`${type} Trade Placed!`, {
          description: res.data.message,
        });
        if (onTradeExecuted) onTradeExecuted();
      } else {
        toast.error('Trade Failed', { description: res.data.message });
      }
    } catch (e) {
      toast.error('Error', { description: e.response?.data?.message || e.message });
    } finally {
      setExecuting(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="quick-trade-panel">
      {/* Mode Warning */}
      <div className={`border rounded-lg p-3 text-sm font-medium ${isLiveMode ? (brokerConnected ? 'bg-red-50 border-red-300 text-red-800' : 'bg-yellow-50 border-yellow-300 text-yellow-800') : 'bg-blue-50 border-blue-300 text-blue-800'}`} data-testid="quick-trade-mode-banner">
        {isLiveMode
          ? (brokerConnected
            ? 'LIVE MODE: Direct trades will be placed on Upstox with REAL money!'
            : 'LIVE MODE: Connect Upstox broker first to place live trades.')
          : 'PAPER MODE: Trades are simulated, no real money involved.'}
      </div>

      {/* Trading Instrument */}
      <Card className="bg-white border-gray-200 p-6 shadow-md" data-testid="quick-trade-card">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800" data-testid="quick-trade-instrument">{instrument}</h2>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Badge className={isLiveMode ? 'bg-red-600' : 'bg-blue-600'}>{tradingMode}</Badge>
            {isLiveMode && <Badge className={brokerConnected ? 'bg-green-600' : 'bg-yellow-600'}>{brokerConnected ? 'Broker Connected' : 'Broker Disconnected'}</Badge>}
          </div>
        </div>

        {/* Risk Settings Display */}
        <div className="grid grid-cols-3 gap-4 mb-6 text-center">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Max Per Trade</p>
            <p className="font-semibold text-gray-800">{formatCurrency(riskSettings.max_per_trade || 50000)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Stop Loss</p>
            <p className="font-semibold text-red-600">{riskSettings.stop_loss_pct || 25}%</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Profit Target</p>
            <p className="font-semibold text-green-600">{riskSettings.target_pct || 10}%</p>
          </div>
        </div>

        {/* CALL / PUT Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <Button
            onClick={() => handleDirectTrade('CALL')}
            disabled={executing || (isLiveMode && !brokerConnected)}
            className="bg-green-600 hover:bg-green-700 text-white text-xl font-bold py-8 rounded-xl shadow-lg hover:shadow-xl transition-all"
            data-testid="direct-call-btn"
          >
            {executing === 'CALL' ? 'Placing...' : 'BUY CALL'}
            <span className="block text-sm font-normal mt-1 opacity-80">Bullish / Market Up</span>
          </Button>
          <Button
            onClick={() => handleDirectTrade('PUT')}
            disabled={executing || (isLiveMode && !brokerConnected)}
            className="bg-red-600 hover:bg-red-700 text-white text-xl font-bold py-8 rounded-xl shadow-lg hover:shadow-xl transition-all"
            data-testid="direct-put-btn"
          >
            {executing === 'PUT' ? 'Placing...' : 'BUY PUT'}
            <span className="block text-sm font-normal mt-1 opacity-80">Bearish / Market Down</span>
          </Button>
        </div>

        <p className="text-xs text-gray-500 text-center mt-4">
          Uses your configured instrument, lot size, and risk settings. Change instrument in Settings &gt; Trading.
        </p>
      </Card>
    </div>
  );
}
