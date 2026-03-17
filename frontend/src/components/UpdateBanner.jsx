import { useState, useEffect, useCallback } from 'react';
import { FaDownload, FaSync, FaCheckCircle, FaExclamationTriangle, FaRedo } from 'react-icons/fa';

const BACKEND_URL = (() => {
  const envUrl = process.env.REACT_APP_BACKEND_URL || '';
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) return '';
  return envUrl;
})();
const API = `${BACKEND_URL}/api`;

export default function UpdateBanner() {
  const [update, setUpdate] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  const checkUpdate = useCallback(async () => {
    try {
      const res = await fetch(`${API}/update-status`);
      if (res.ok) {
        const data = await res.json();
        if (data.status && data.status !== 'idle') setUpdate(data);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    checkUpdate();
    const interval = setInterval(checkUpdate, 5000);

    const handler = (e) => setUpdate(e.detail);
    window.addEventListener('app-update', handler);

    return () => {
      clearInterval(interval);
      window.removeEventListener('app-update', handler);
    };
  }, [checkUpdate]);

  if (!update || update.status === 'idle' || update.status === 'up-to-date' || dismissed) return null;

  const doAction = async (endpoint) => {
    try { await fetch(`${API}/${endpoint}`, { method: 'POST' }); checkUpdate(); } catch (_) {}
  };

  const bgColor = {
    checking: 'bg-blue-600',
    available: 'bg-green-600',
    downloading: 'bg-blue-700',
    downloaded: 'bg-green-700',
    error: 'bg-red-600',
  }[update.status] || 'bg-gray-700';

  return (
    <div className={`${bgColor} text-white px-4 py-3 flex items-center justify-between gap-3 shadow-lg`} data-testid="update-banner">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {update.status === 'checking' && <FaSync className="animate-spin flex-shrink-0" />}
        {update.status === 'available' && <FaDownload className="flex-shrink-0" />}
        {update.status === 'downloading' && <FaSync className="animate-spin flex-shrink-0" />}
        {update.status === 'downloaded' && <FaCheckCircle className="flex-shrink-0" />}
        {update.status === 'error' && <FaExclamationTriangle className="flex-shrink-0" />}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{update.message}</p>
          {update.status === 'downloading' && (
            <div className="mt-1.5 w-full bg-white/25 rounded-full h-2 overflow-hidden">
              <div className="bg-white h-full rounded-full transition-all duration-300" style={{ width: `${update.progress}%` }} />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {update.status === 'available' && (
          <button onClick={() => doAction('download-update')} className="bg-white text-green-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-green-50 transition-colors" data-testid="download-update-btn">
            Download v{update.newVersion}
          </button>
        )}
        {update.status === 'downloaded' && (
          <button onClick={() => doAction('install-update')} className="bg-white text-green-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-green-50 animate-pulse transition-colors" data-testid="install-update-btn">
            <FaRedo className="inline mr-1" /> Restart & Update
          </button>
        )}
        {update.status === 'error' && (
          <button onClick={() => doAction('check-update')} className="bg-white text-red-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-red-50 transition-colors" data-testid="retry-update-btn">
            Retry
          </button>
        )}
        {update.status !== 'downloading' && (
          <button onClick={() => setDismissed(true)} className="text-white/70 hover:text-white text-lg px-1" data-testid="dismiss-update-btn">
            ×
          </button>
        )}
      </div>
    </div>
  );
}
