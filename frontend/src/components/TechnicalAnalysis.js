import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import axios from 'axios';
import { FaSync, FaChartLine, FaArrowUp, FaArrowDown, FaMinus } from 'react-icons/fa';

const BACKEND_URL = (() => {
  const envUrl = process.env.REACT_APP_BACKEND_URL || '';
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) return '';
  return envUrl;
})();
const API = `${BACKEND_URL}/api`;

const SIGNAL_COLORS = {
  BULLISH: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', icon: FaArrowUp },
  BEARISH: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', icon: FaArrowDown },
  NEUTRAL: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300', icon: FaMinus },
};

function SignalBadge({ signal, size = 'sm' }) {
  const style = SIGNAL_COLORS[signal] || SIGNAL_COLORS.NEUTRAL;
  const Icon = style.icon;
  return (
    <Badge className={`${style.bg} ${style.text} border ${style.border} gap-1 ${size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs'}`} data-testid={`signal-badge-${signal?.toLowerCase()}`}>
      <Icon className={size === 'lg' ? 'text-xs' : 'text-[10px]'} /> {signal}
    </Badge>
  );
}

function GaugeRing({ value, max = 100, label, color }) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const strokeColor = value > 70 ? '#ef4444' : value < 30 ? '#22c55e' : '#f59e0b';
  return (
    <div className="flex flex-col items-center">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="6" />
        <circle cx="44" cy="44" r={radius} fill="none" stroke={color || strokeColor} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 44 44)" className="transition-all duration-700" />
        <text x="44" y="41" textAnchor="middle" className="text-lg font-bold" fill="#1f2937" fontSize="16">{value ?? '--'}</text>
        <text x="44" y="56" textAnchor="middle" fill="#9ca3af" fontSize="9">{label}</text>
      </svg>
    </div>
  );
}

export default function TechnicalAnalysis() {
  const [instrument, setInstrument] = useState('NIFTY50');
  const [interval, setInterval] = useState('5minute');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    axios.get(`${API}/technical/intervals`).then(r => {
      if (r.data?.status === 'success') setConfig(r.data);
    }).catch(() => {});
  }, []);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/technical/analysis?instrument=${instrument}&interval=${interval}`);
      if (r.data?.status === 'success') setData(r.data);
    } catch (e) {
      console.error('Technical analysis error:', e);
    } finally {
      setLoading(false);
    }
  }, [instrument, interval]);

  useEffect(() => { fetchAnalysis(); }, [fetchAnalysis]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(fetchAnalysis, 30000);
    return () => window.clearInterval(id);
  }, [autoRefresh, fetchAnalysis]);

  const ind = data?.indicators || {};
  const overall = data?.overall || {};
  const price = data?.price || {};

  return (
    <div className="space-y-4" data-testid="technical-analysis-page">
      {/* Controls */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FaChartLine className="text-indigo-600" />
            <select value={instrument} onChange={e => setInstrument(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium" data-testid="ta-instrument-select">
              {(config?.instruments || ['NIFTY50','BANKNIFTY','FINNIFTY','SENSEX']).map(i => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(config?.intervals || [
                {value:'1minute',label:'1M'},{value:'5minute',label:'5M'},{value:'15minute',label:'15M'},
                {value:'30minute',label:'30M'},{value:'1hour',label:'1H'},{value:'1day',label:'1D'},
              ]).map(tf => (
                <button key={tf.value} onClick={() => setInterval(tf.value)}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition ${interval === tf.value ? 'bg-white shadow text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
                  data-testid={`tf-${tf.value}`}>
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data?.source && (
              <Badge className={`text-xs ${data.source === 'upstox' ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-700'}`} data-testid="ta-source-badge">
                {data.source === 'upstox' ? 'Live Data' : 'Demo Data'}
              </Badge>
            )}
            <button onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium border transition ${autoRefresh ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-300 text-gray-600'}`}
              data-testid="auto-refresh-toggle">
              Auto {autoRefresh ? 'ON' : 'OFF'}
            </button>
            <Button onClick={fetchAnalysis} disabled={loading} variant="outline" size="sm" className="gap-1.5" data-testid="ta-refresh-btn">
              <FaSync className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
          </div>
        </div>
      </Card>

      {!data ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500">{loading ? 'Loading analysis...' : 'Select an instrument to analyze'}</p>
        </Card>
      ) : (
        <>
          {/* Overall Signal + Price */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className={`p-5 border-2 ${overall.signal === 'BULLISH' ? 'border-green-300 bg-green-50/30' : overall.signal === 'BEARISH' ? 'border-red-300 bg-red-50/30' : 'border-gray-200'}`} data-testid="overall-signal-card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800 text-base">Overall Signal</h3>
                <SignalBadge signal={overall.signal} size="lg" />
              </div>
              <div className="flex items-center justify-center py-2">
                <GaugeRing value={overall.strength} label="Strength" color={overall.signal === 'BULLISH' ? '#22c55e' : overall.signal === 'BEARISH' ? '#ef4444' : '#f59e0b'} />
              </div>
              <div className="flex justify-center gap-4 mt-2 text-xs">
                <span className="text-green-600 font-medium" data-testid="bullish-count">{overall.bullish_count} Bullish</span>
                <span className="text-red-600 font-medium" data-testid="bearish-count">{overall.bearish_count} Bearish</span>
                <span className="text-gray-500 font-medium">{overall.neutral_count} Neutral</span>
              </div>
            </Card>

            <Card className="p-5" data-testid="price-card">
              <h3 className="font-bold text-gray-800 text-base mb-3">{instrument} Price</h3>
              <p className="text-3xl font-bold text-gray-900">{price.current?.toLocaleString('en-IN')}</p>
              <p className={`text-sm font-semibold mt-1 ${price.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {price.change >= 0 ? '+' : ''}{price.change} ({price.change_pct}%)
              </p>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-green-50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-gray-500">20P High</p>
                  <p className="text-sm font-bold text-green-700">{price.high?.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-gray-500">20P Low</p>
                  <p className="text-sm font-bold text-red-700">{price.low?.toLocaleString('en-IN')}</p>
                </div>
              </div>
            </Card>

            <Card className="p-5" data-testid="moving-averages-card">
              <h3 className="font-bold text-gray-800 text-base mb-3">Moving Averages</h3>
              <div className="space-y-3">
                {[
                  ['EMA 9', ind.ema?.ema_9],
                  ['EMA 21', ind.ema?.ema_21],
                  ['SMA 20', ind.sma?.sma_20],
                  ['SMA 50', ind.sma?.sma_50],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between items-center py-1 border-b border-gray-50">
                    <span className="text-sm text-gray-600">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{val?.toLocaleString('en-IN') || '--'}</span>
                      {val && price.current && (
                        <span className={`text-[10px] font-medium ${price.current > val ? 'text-green-600' : 'text-red-600'}`}>
                          {price.current > val ? 'Above' : 'Below'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="pt-1">
                  <SignalBadge signal={ind.ema?.signal} />
                  <span className="text-xs text-gray-500 ml-2">{ind.ema?.reason}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Indicator Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* RSI */}
            <Card className="p-5" data-testid="rsi-card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800 text-base">RSI (14)</h3>
                <SignalBadge signal={ind.rsi?.signal} />
              </div>
              <div className="flex justify-center py-2">
                <GaugeRing value={ind.rsi?.value} label="RSI" />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-2 px-2">
                <span>Oversold (&lt;30)</span>
                <span>Overbought (&gt;70)</span>
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">{ind.rsi?.reason}</p>
            </Card>

            {/* MACD */}
            <Card className="p-5" data-testid="macd-card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800 text-base">MACD (12,26,9)</h3>
                <SignalBadge signal={ind.macd?.signal} />
              </div>
              <div className="space-y-3 mt-4">
                {[
                  ['MACD Line', ind.macd?.value],
                  ['Signal Line', ind.macd?.signal_line],
                  ['Histogram', ind.macd?.histogram],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                    <span className="text-sm text-gray-600">{label}</span>
                    <span className={`text-sm font-bold ${val > 0 ? 'text-green-600' : val < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      {val != null ? val.toFixed(2) : '--'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-3 text-center">{ind.macd?.reason}</p>
            </Card>

            {/* VWAP */}
            <Card className="p-5" data-testid="vwap-card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800 text-base">VWAP</h3>
                <SignalBadge signal={ind.vwap?.signal} />
              </div>
              <div className="flex flex-col items-center py-4">
                <p className="text-2xl font-bold text-gray-900">{ind.vwap?.value?.toLocaleString('en-IN') || '--'}</p>
                <p className="text-xs text-gray-500 mt-1">Volume Weighted Avg Price</p>
                {ind.vwap?.value && price.current && (
                  <div className={`mt-3 px-3 py-1.5 rounded-full text-xs font-medium ${price.current > ind.vwap.value ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    Price is {Math.abs(((price.current - ind.vwap.value) / ind.vwap.value) * 100).toFixed(2)}% {price.current > ind.vwap.value ? 'above' : 'below'} VWAP
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">{ind.vwap?.reason}</p>
            </Card>
          </div>

          {/* Candle Info */}
          <p className="text-xs text-gray-400 italic px-1" data-testid="ta-info">
            {data.source === 'demo' ? 'Showing demo/simulated data. Connect broker for live analysis.' : 'Live data from Upstox.'} | {data.candle_count} candles analyzed | {interval} timeframe
          </p>
        </>
      )}
    </div>
  );
}
