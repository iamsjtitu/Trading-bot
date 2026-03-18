import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Badge } from '@/components/ui/badge';

const API = `${process.env.REACT_APP_BACKEND_URL || ''}/api`;

export default function MarketStatusBanner() {
  const [marketStatus, setMarketStatus] = useState(null);
  const [countdown, setCountdown] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/market-status`);
      if (res.data.status === 'success') {
        setMarketStatus(res.data);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Countdown timer for market open/close
  useEffect(() => {
    if (!marketStatus) return;

    const targetISO = marketStatus.is_open ? marketStatus.closes_at : marketStatus.next_open;
    if (!targetISO) { setCountdown(''); return; }

    const tick = () => {
      const now = Date.now();
      const target = new Date(targetISO).getTime();
      const diff = target - now;
      if (diff <= 0) { setCountdown(''); fetchStatus(); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 24) {
        const days = Math.floor(h / 24);
        setCountdown(`${days}d ${h % 24}h ${m}m`);
      } else {
        setCountdown(`${h}h ${m}m ${s}s`);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [marketStatus, fetchStatus]);

  if (!marketStatus) return null;

  if (marketStatus.is_open) {
    return (
      <div className="mb-4 px-4 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50/80 flex items-center justify-between" data-testid="market-status-banner">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-emerald-800 text-sm" data-testid="market-status-text">Market Open</span>
        </div>
        {countdown && (
          <Badge className="bg-emerald-600 text-white text-xs" data-testid="market-countdown">
            Closes in {countdown}
          </Badge>
        )}
      </div>
    );
  }

  // Market Closed
  const reasonStyles = {
    weekend: { bg: 'bg-slate-50/80', border: 'border-slate-200', text: 'text-slate-700', dot: 'bg-slate-400' },
    holiday: { bg: 'bg-amber-50/80', border: 'border-amber-200', text: 'text-amber-800', dot: 'bg-amber-500' },
    pre_open: { bg: 'bg-sky-50/80', border: 'border-sky-200', text: 'text-sky-800', dot: 'bg-sky-500' },
    before_hours: { bg: 'bg-slate-50/80', border: 'border-slate-200', text: 'text-slate-700', dot: 'bg-slate-400' },
    after_hours: { bg: 'bg-slate-50/80', border: 'border-slate-200', text: 'text-slate-700', dot: 'bg-slate-400' },
  };
  const s = reasonStyles[marketStatus.reason] || reasonStyles.after_hours;

  return (
    <div className={`mb-4 px-4 py-3 rounded-lg border ${s.border} ${s.bg}`} data-testid="market-status-banner">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className={`inline-flex rounded-full h-3 w-3 ${s.dot}`}></span>
          <div>
            <span className={`font-semibold text-sm ${s.text}`} data-testid="market-status-text">
              {marketStatus.message}
            </span>
            {marketStatus.holiday_name && (
              <span className="ml-2 text-xs text-amber-600 font-medium">({marketStatus.holiday_name})</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {countdown && (
            <Badge className="bg-slate-600 text-white text-xs" data-testid="market-countdown">
              Opens in {countdown}
            </Badge>
          )}
          {marketStatus.next_open_label && (
            <span className="text-xs text-gray-500" data-testid="market-next-open">
              Next: {marketStatus.next_open_label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
