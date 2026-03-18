/**
 * Market Status Routes for Desktop App
 * Handles: Market open/close detection, Indian holidays, next opening time
 */
const { Router } = require('express');

// NSE/BSE Holidays 2025-2026
const NSE_HOLIDAYS = {
  '2025-02-26': 'Mahashivratri',
  '2025-03-14': 'Holi',
  '2025-03-31': 'Id-Ul-Fitr (Ramadan)',
  '2025-04-10': 'Shri Mahavir Jayanti',
  '2025-04-14': 'Dr. Baba Saheb Ambedkar Jayanti',
  '2025-04-18': 'Good Friday',
  '2025-05-01': 'Maharashtra Day',
  '2025-08-15': 'Independence Day',
  '2025-08-27': 'Ganesh Chaturthi',
  '2025-10-02': 'Mahatma Gandhi Jayanti / Dussehra',
  '2025-10-21': 'Diwali (Laxmi Puja)',
  '2025-10-22': 'Diwali Balipratipada',
  '2025-11-05': 'Prakash Gurpurab Sri Guru Nanak Dev',
  '2025-12-25': 'Christmas',
  '2026-01-26': 'Republic Day',
  '2026-02-17': 'Mahashivratri',
  '2026-03-03': 'Holi',
  '2026-03-20': 'Id-Ul-Fitr (Ramadan)',
  '2026-03-30': 'Shri Mahavir Jayanti',
  '2026-04-03': 'Good Friday',
  '2026-04-14': 'Dr. Baba Saheb Ambedkar Jayanti',
  '2026-05-01': 'Maharashtra Day',
  '2026-05-28': 'Id-Ul-Adha (Bakri Id)',
  '2026-08-15': 'Independence Day',
  '2026-08-17': 'Ganesh Chaturthi',
  '2026-10-02': 'Mahatma Gandhi Jayanti',
  '2026-10-09': 'Diwali (Laxmi Puja)',
  '2026-10-10': 'Diwali Balipratipada',
  '2026-10-20': 'Dussehra',
  '2026-11-25': 'Prakash Gurpurab Sri Guru Nanak Dev',
  '2026-12-25': 'Christmas',
};

function getIST() {
  const now = new Date();
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
}

function formatDateKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function nextTradingDay(fromIST) {
  const d = new Date(fromIST);
  d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 30; i++) {
    const key = formatDateKey(d);
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5 && !NSE_HOLIDAYS[key]) {
      // Return 9:15 AM IST = 3:45 AM UTC
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3, 45, 0));
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return new Date(fromIST.getTime() + 86400000);
}

function formatLabel(utcDate) {
  const ist = new Date(utcDate.getTime() + 5.5 * 60 * 60 * 1000);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = days[ist.getUTCDay()];
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const mon = months[ist.getUTCMonth()];
  const year = ist.getUTCFullYear();
  const h = ist.getUTCHours();
  const m = String(ist.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${day}, ${dd} ${mon} ${year} at ${String(h12).padStart(2, '0')}:${m} ${ampm} IST`;
}

module.exports = function (db) {
  const router = Router();

  // GET /api/market-status
  router.get('/api/market-status', (req, res) => {
    const ist = getIST();
    const weekday = ist.getUTCDay(); // 0=Sun, 6=Sat
    const h = ist.getUTCHours();
    const m = ist.getUTCMinutes();
    const totalMin = h * 60 + m;
    const dateKey = formatDateKey(ist);
    const holidayName = NSE_HOLIDAYS[dateKey] || null;

    // --- NSE Status ---
    let nse;
    if (weekday === 0 || weekday === 6) {
      const nextOpen = nextTradingDay(ist);
      nse = { is_open: false, reason: 'weekend', message: `Market Closed - ${weekday === 6 ? 'Saturday' : 'Sunday'}`, next_open: nextOpen.toISOString(), next_open_label: formatLabel(nextOpen), holiday_name: null };
    } else if (holidayName) {
      const nextOpen = nextTradingDay(ist);
      nse = { is_open: false, reason: 'holiday', message: `Market Closed - ${holidayName}`, next_open: nextOpen.toISOString(), next_open_label: formatLabel(nextOpen), holiday_name: holidayName };
    } else if (totalMin >= 540 && totalMin < 555) {
      const openToday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 3, 45, 0));
      nse = { is_open: false, reason: 'pre_open', message: 'Pre-Open Session', next_open: openToday.toISOString(), next_open_label: '09:15 AM IST today', holiday_name: null };
    } else if (totalMin < 555) {
      const openToday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 3, 45, 0));
      nse = { is_open: false, reason: 'before_hours', message: 'Market Closed - Before Trading Hours', next_open: openToday.toISOString(), next_open_label: '09:15 AM IST today', holiday_name: null };
    } else if (totalMin >= 930) {
      const nextOpen = nextTradingDay(ist);
      nse = { is_open: false, reason: 'after_hours', message: 'Market Closed - After Trading Hours', next_open: nextOpen.toISOString(), next_open_label: formatLabel(nextOpen), holiday_name: null };
    } else {
      const remaining = 930 - totalMin;
      const closeToday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 10, 0, 0));
      nse = { is_open: true, reason: 'trading_hours', message: 'Market Open', closes_at: closeToday.toISOString(), time_remaining: `${Math.floor(remaining/60)}h ${remaining%60}m`, next_open: null, next_open_label: null, holiday_name: null };
    }

    // --- MCX Status (9:00 AM - 11:30 PM IST = 540 - 1410 min) ---
    let mcx;
    if (weekday === 0 || weekday === 6) {
      // Next weekday 9:00 AM
      const d = new Date(ist); d.setUTCDate(d.getUTCDate() + (weekday === 6 ? 2 : 1));
      const nextOpen = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3, 30, 0));
      mcx = { is_open: false, reason: 'weekend', message: `MCX Closed - ${weekday === 6 ? 'Saturday' : 'Sunday'}`, next_open: nextOpen.toISOString(), next_open_label: formatLabel(nextOpen) };
    } else if (totalMin < 540) {
      const openToday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 3, 30, 0));
      mcx = { is_open: false, reason: 'before_hours', message: 'MCX Closed - Before Trading Hours', next_open: openToday.toISOString(), next_open_label: '09:00 AM IST today' };
    } else if (totalMin >= 1410) {
      const d = new Date(ist); d.setUTCDate(d.getUTCDate() + 1);
      while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
      const nextOpen = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3, 30, 0));
      mcx = { is_open: false, reason: 'after_hours', message: 'MCX Closed - After Trading Hours', next_open: nextOpen.toISOString(), next_open_label: formatLabel(nextOpen) };
    } else {
      const remaining = 1410 - totalMin;
      const closeToday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 18, 0, 0)); // 23:30 IST = 18:00 UTC
      mcx = { is_open: true, reason: 'trading_hours', message: 'MCX Open', closes_at: closeToday.toISOString(), time_remaining: `${Math.floor(remaining/60)}h ${remaining%60}m`, next_open: null, next_open_label: null };
    }

    res.json({ status: 'success', nse, mcx, ...nse });
  });

  // GET /api/market-holidays
  router.get('/api/market-holidays', (req, res) => {
    const count = parseInt(req.query.count) || 5;
    const today = formatDateKey(getIST());
    const upcoming = Object.entries(NSE_HOLIDAYS)
      .filter(([date]) => date >= today)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, count)
      .map(([date, name]) => {
        const d = new Date(date + 'T00:00:00Z');
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return { date, day: days[d.getUTCDay()], name };
      });
    res.json({ status: 'success', holidays: upcoming });
  });

  return router;
};
