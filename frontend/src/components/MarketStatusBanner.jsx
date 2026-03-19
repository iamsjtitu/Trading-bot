import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Badge } from '@/components/ui/badge';

const API = `${process.env.REACT_APP_BACKEND_URL || ''}/api`;

function Countdown({ targetISO, label, onExpire }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!targetISO) { setText(''); return; }
    const tick = () => {
      const diff = new Date(targetISO).getTime() - Date.now();
      if (diff <= 0) { setText(''); if (onExpire) onExpire(); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setText(h > 24 ? `${Math.floor(h/24)}d ${h%24}h ${m}m` : `${h}h ${m}m ${s}s`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [targetISO, onExpire]);
  if (!text) return null;
  return <Badge className="bg-slate-600 text-white text-xs" data-testid={`countdown-${label}`}>{label} in {text}</Badge>;
}

function StatusDot({ open }) {
  if (open) return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
    </span>
  );
  return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-slate-400"></span>;
}

export default function MarketStatusBanner() {
  const [data, setData] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/market-status`);
      if (res.data.status === 'success') setData(res.data);
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (!data) return null;

  const nse = data.nse || data;

  return (
    <div className="mb-4 flex gap-3 flex-wrap" data-testid="market-status-banner">
      {/* NSE/BSE Status */}
      <div className={`flex-1 min-w-[280px] px-4 py-2.5 rounded-lg border flex items-center justify-between ${
        nse.is_open ? 'border-emerald-200 bg-emerald-50/80' : 'border-slate-200 bg-slate-50/80'
      }`}>
        <div className="flex items-center gap-2.5">
          <StatusDot open={nse.is_open} />
          <div>
            <span className={`font-semibold text-sm ${nse.is_open ? 'text-emerald-800' : 'text-slate-700'}`} data-testid="nse-status-text">
              NSE/BSE: {nse.message}
            </span>
            {nse.holiday_name && <span className="ml-2 text-xs text-amber-600 font-medium">({nse.holiday_name})</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {nse.is_open ? (
            <Countdown targetISO={nse.closes_at} label="Closes" onExpire={fetchStatus} />
          ) : (
            <>
              <Countdown targetISO={nse.next_open} label="Opens" onExpire={fetchStatus} />
              {nse.next_open_label && <span className="text-xs text-gray-400 hidden sm:inline">{nse.next_open_label}</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
