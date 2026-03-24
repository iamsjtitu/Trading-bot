# AI-Powered Options Trading Bot - PRD

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses GPT-4o for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on various brokers (starting with Upstox). Standalone desktop app for Windows/Mac with auto-update.

## Core Architecture
- **Backend**: Node.js (Express) at `/app/desktop/`
- **Frontend**: React at `/app/frontend/`
- **Desktop**: Electron at `/app/desktop/main.js`
- **Database**: lowdb (JSON file-based) at `/app/desktop/data/`
- **AI**: GPT-4o via Emergent LLM Key
- **APIs**: Upstox REST API v2, Telegram Bot API
- **Proxy**: Python FastAPI at `/app/backend/server.py` (forwards to Node.js)

## Current Version: v27.1.0

## Version Management
- **Single source of truth**: `desktop/package.json` -> `version` field

## Completed Features
- AI-powered sentiment analysis (GPT-4o via Emergent LLM Key)
- Live news from 13 sources (Bloomberg, India Today, Reuters, etc.)
- Paper & Live trading modes
- Upstox broker integration with P&L sync
- Real-time market data & Option Chain
- AI Guards (9 safety guards including Max Daily Profit & Max Daily Loss)
- AI Exit Advisor (HOLD/EXIT/PARTIAL_EXIT/TIGHTEN_SL)
- Kelly Criterion position sizing (ADVISORY MODE - never blocks 1 lot)
- Options Greeks & IV analysis
- Telegram alerts (7 alert types) with anti-spam cooldown
- AI Morning Briefing (9:00 AM IST weekdays)
- Tax Reporting (CSV export)
- Auto-update mechanism (Electron + GitHub)
- Background jobs: Market Data Fetcher, Exit Advisor, Morning Briefing
- Emergency Stop, Trailing SL, Auto re-entry
- Trade Journal with AI reviews
- System Health Dashboard
- App.js Refactoring (830 -> 134 lines)
- Guard-First AI Analysis (saves API balance)
- Telegram Anti-Spam (30-min cooldown per guard)
- Smart Broker-based Position Sizing (LIVE mode uses available margin)
- Fixed P&L Mismatch (broker data as single source of truth)
- Fixed max_per_trade hard limit
- Fixed Kelly Criterion (advisory only)
- Fixed Single Trade Concurrency (2-min grace period)
- Fixed Auto-Exit Target
- Fixed Live Data Failure (token path)
- Fixed GitHub Actions Build (Windows xcopy/if exist)
- Token Expiry Handling (frontend notifications + backend graceful errors)
- Manual Trade Entry from Signals
- Manual Trade Exit with Toast
- Quick Trade (Direct CALL/PUT without signal)
- Order Slicing (entry + exit, respects freeze quantity limits)
- API Cost Optimization (keyword pre-filter, manual analyze)
- Signal Expiry (1 hour)
- Fresh News Filter (last 24 hours)

## Bug Fixes (v27.1.0)
1. **Exit Advisor Telegram Spam Fix (P0)** - FIXED 2026-03-24
   - Root cause: Exit Advisor `checkAllOpenTrades` sent Telegram alerts every 3 min interval for the same trade+action without any cooldown/deduplication
   - Fix: Added 30-min cooldown per trade+action combo in `advisorState.telegram_cooldown`, plus cooldown cleanup when trades close (manual exit, auto exit, stale cleanup, broker sync close)
   - Files changed: `exit_advisor.js` (cooldown tracker + cleanup), `trading.js` (clearTradeCooldown on all exit paths)
2. **Broker Position Limit (RMS) Pre-Check (P0)** - FIXED 2026-03-24
   - Root cause: Upstox RMS rejects orders when total position value exceeds broker's clientwise limit
   - Fix: Added `max_position_value` setting (default ₹2,75,000), pre-trade position value check in `executeLiveTrade`, auto-reduces trade size to fit remaining capacity, clear Hinglish error messages for RMS/margin/token errors
   - Files changed: `signal_generator.js` (position check + error parsing), `settings.js` (new default), `SettingsPanel.js` (new UI field)

## Pending/Backlog
- **P0**: Desktop app build trigger for v27.1.0
- **P0**: Remind user to re-login to Upstox (token expired)
- **P1**: Refactor SettingsPanel.js (750+ lines -> smaller components)
- **P2**: Multi-broker support (Zerodha, Angel One, etc.)
- **P3**: Daily performance summary with charts on Telegram

## Key Files
- `/app/desktop/routes/lib/exit_advisor.js` - Exit Advisor with 30-min Telegram cooldown
- `/app/desktop/routes/trading.js` - Trading routes with cooldown cleanup on exits
- `/app/desktop/routes/lib/telegram.js` - Telegram notification module
- `/app/desktop/routes/lib/signal_generator.js` - Trade execution with smart sizing
- `/app/frontend/src/components/SettingsPanel.js` - Settings UI
- `/app/frontend/src/hooks/useAppState.js` - State management hook
- `/app/frontend/src/App.js` - Refactored main UI

## Test Reports
- `/app/test_reports/iteration_45.json` - v15.0.0 App.js refactoring
- `/app/test_reports/iteration_46.json` - v15.0.0 Telegram/Guard bug fixes
- `/app/test_reports/iteration_47.json` - Latest test run
