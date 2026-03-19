"""
Indian Stock Market Hours Service
Handles market open/close status, next opening time, and Indian public holidays.
"""
from datetime import datetime, timedelta, timezone, time

IST = timezone(timedelta(hours=5, minutes=30))

MARKET_OPEN = time(9, 15)
MARKET_CLOSE = time(15, 30)
PRE_OPEN_START = time(9, 0)

# MCX Commodity market hours
MCX_OPEN = time(9, 0)
MCX_CLOSE = time(23, 30)

# NSE/BSE Holidays 2025-2026 (confirmed + expected)
NSE_HOLIDAYS = {
    # 2025
    "2025-02-26": "Mahashivratri",
    "2025-03-14": "Holi",
    "2025-03-31": "Id-Ul-Fitr (Ramadan)",
    "2025-04-10": "Shri Mahavir Jayanti",
    "2025-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
    "2025-04-18": "Good Friday",
    "2025-05-01": "Maharashtra Day",
    "2025-08-15": "Independence Day",
    "2025-08-27": "Ganesh Chaturthi",
    "2025-10-02": "Mahatma Gandhi Jayanti / Dussehra",
    "2025-10-21": "Diwali (Laxmi Puja)",
    "2025-10-22": "Diwali Balipratipada",
    "2025-11-05": "Prakash Gurpurab Sri Guru Nanak Dev",
    "2025-12-25": "Christmas",
    # 2026 (expected)
    "2026-01-26": "Republic Day",
    "2026-02-17": "Mahashivratri",
    "2026-03-03": "Holi",
    "2026-03-26": "Ram Navami",
    "2026-03-31": "Shri Mahavir Jayanti",
    "2026-04-03": "Good Friday",
    "2026-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
    "2026-05-01": "Maharashtra Day",
    "2026-05-28": "Id-Ul-Adha (Bakri Id)",
    "2026-08-15": "Independence Day",
    "2026-08-17": "Ganesh Chaturthi",
    "2026-10-02": "Mahatma Gandhi Jayanti",
    "2026-10-09": "Diwali (Laxmi Puja)",
    "2026-10-10": "Diwali Balipratipada",
    "2026-10-20": "Dussehra",
    "2026-11-25": "Prakash Gurpurab Sri Guru Nanak Dev",
    "2026-12-25": "Christmas",
}


def _is_holiday(dt: datetime) -> str | None:
    """Check if given date (IST) is a holiday. Returns holiday name or None."""
    key = dt.strftime("%Y-%m-%d")
    return NSE_HOLIDAYS.get(key)


def _next_trading_day(from_dt: datetime) -> datetime:
    """Find next trading day (weekday and not a holiday) from given IST datetime."""
    d = from_dt.date() + timedelta(days=1)
    for _ in range(30):  # safety limit
        key = d.strftime("%Y-%m-%d")
        if d.weekday() < 5 and key not in NSE_HOLIDAYS:
            return datetime.combine(d, MARKET_OPEN, tzinfo=IST)
        d += timedelta(days=1)
    # Fallback: next Monday
    while d.weekday() != 0:
        d += timedelta(days=1)
    return datetime.combine(d, MARKET_OPEN, tzinfo=IST)


def get_market_status() -> dict:
    """
    Returns current Indian stock market status.
    """
    now_ist = datetime.now(IST)
    today = now_ist.date()
    current_time = now_ist.time()
    weekday = now_ist.weekday()  # 0=Mon, 6=Sun

    holiday_name = _is_holiday(now_ist)

    # Weekend
    if weekday >= 5:
        next_open = _next_trading_day(now_ist)
        day_label = "Saturday" if weekday == 5 else "Sunday"
        return {
            "is_open": False,
            "reason": "weekend",
            "message": f"Market Closed - {day_label}",
            "next_open": next_open.isoformat(),
            "next_open_label": next_open.strftime("%A, %d %b %Y at %I:%M %p IST"),
            "holiday_name": None,
        }

    # Public holiday
    if holiday_name:
        next_open = _next_trading_day(now_ist)
        return {
            "is_open": False,
            "reason": "holiday",
            "message": f"Market Closed - {holiday_name}",
            "next_open": next_open.isoformat(),
            "next_open_label": next_open.strftime("%A, %d %b %Y at %I:%M %p IST"),
            "holiday_name": holiday_name,
        }

    # Before market hours
    if current_time < MARKET_OPEN:
        open_today = datetime.combine(today, MARKET_OPEN, tzinfo=IST)
        if current_time >= PRE_OPEN_START:
            return {
                "is_open": False,
                "reason": "pre_open",
                "message": "Pre-Open Session",
                "next_open": open_today.isoformat(),
                "next_open_label": open_today.strftime("%I:%M %p IST today"),
                "holiday_name": None,
            }
        return {
            "is_open": False,
            "reason": "before_hours",
            "message": "Market Closed - Before Trading Hours",
            "next_open": open_today.isoformat(),
            "next_open_label": open_today.strftime("%I:%M %p IST today"),
            "holiday_name": None,
        }

    # After market hours
    if current_time >= MARKET_CLOSE:
        next_open = _next_trading_day(now_ist)
        return {
            "is_open": False,
            "reason": "after_hours",
            "message": "Market Closed - After Trading Hours",
            "next_open": next_open.isoformat(),
            "next_open_label": next_open.strftime("%A, %d %b %Y at %I:%M %p IST"),
            "holiday_name": None,
        }

    # Market is OPEN
    close_today = datetime.combine(today, MARKET_CLOSE, tzinfo=IST)
    remaining = close_today - now_ist
    hours_left = int(remaining.total_seconds() // 3600)
    mins_left = int((remaining.total_seconds() % 3600) // 60)

    return {
        "is_open": True,
        "reason": "trading_hours",
        "message": "Market Open",
        "closes_at": close_today.isoformat(),
        "time_remaining": f"{hours_left}h {mins_left}m",
        "next_open": None,
        "next_open_label": None,
        "holiday_name": None,
    }


def _next_mcx_trading_day(from_dt: datetime) -> datetime:
    """Find next MCX trading day."""
    d = from_dt.date() + timedelta(days=1)
    for _ in range(30):
        if d.weekday() < 5:
            return datetime.combine(d, MCX_OPEN, tzinfo=IST)
        d += timedelta(days=1)
    return datetime.combine(d, MCX_OPEN, tzinfo=IST)


def get_mcx_status() -> dict:
    """Returns MCX commodity market status (9:00 AM - 11:30 PM IST, Mon-Fri)."""
    now_ist = datetime.now(IST)
    today = now_ist.date()
    current_time = now_ist.time()
    weekday = now_ist.weekday()

    if weekday >= 5:
        next_open = _next_mcx_trading_day(now_ist)
        day_label = "Saturday" if weekday == 5 else "Sunday"
        return {
            "is_open": False,
            "reason": "weekend",
            "message": f"MCX Closed - {day_label}",
            "next_open": next_open.isoformat(),
            "next_open_label": next_open.strftime("%A, %d %b %Y at %I:%M %p IST"),
        }

    if current_time < MCX_OPEN:
        open_today = datetime.combine(today, MCX_OPEN, tzinfo=IST)
        return {
            "is_open": False,
            "reason": "before_hours",
            "message": "MCX Closed - Before Trading Hours",
            "next_open": open_today.isoformat(),
            "next_open_label": "09:00 AM IST today",
        }

    if current_time >= MCX_CLOSE:
        next_open = _next_mcx_trading_day(now_ist)
        return {
            "is_open": False,
            "reason": "after_hours",
            "message": "MCX Closed - After Trading Hours",
            "next_open": next_open.isoformat(),
            "next_open_label": next_open.strftime("%A, %d %b %Y at %I:%M %p IST"),
        }

    # MCX is OPEN
    close_today = datetime.combine(today, MCX_CLOSE, tzinfo=IST)
    remaining = close_today - now_ist
    hours_left = int(remaining.total_seconds() // 3600)
    mins_left = int((remaining.total_seconds() % 3600) // 60)

    return {
        "is_open": True,
        "reason": "trading_hours",
        "message": "MCX Open",
        "closes_at": close_today.isoformat(),
        "time_remaining": f"{hours_left}h {mins_left}m",
        "next_open": None,
        "next_open_label": None,
    }


def get_upcoming_holidays(count: int = 5) -> list:
    """Get next N upcoming holidays from today."""
    today = datetime.now(IST).date()
    upcoming = []
    for date_str, name in sorted(NSE_HOLIDAYS.items()):
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
        if d >= today:
            upcoming.append({
                "date": date_str,
                "day": d.strftime("%A"),
                "name": name,
            })
        if len(upcoming) >= count:
            break
    return upcoming
