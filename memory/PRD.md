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

## Current Version: v15.0.0

## Version Management
- **Single source of truth**: `desktop/package.json` → `version` field

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
- App.js Refactoring (830 → 134 lines)
- Guard-First AI Analysis (saves API balance)
- Telegram Anti-Spam (30-min cooldown per guard)
- **Smart Broker-based Position Sizing** (LIVE mode uses available margin)

## Bug Fixes (Latest Session)
1. **Telegram "New Signal: undefined"** — Fixed formatSignalAlert to use signal_type
2. **AI balance waste on guard hit** — Early guard check in news.js BEFORE AI loop
3. **Telegram guard spam** — 30-min cooldown per guard in notifyGuardBlock()
4. **"1 lot cost exceeds max per trade"** — Kelly Criterion now advisory mode:
   - LIVE mode fetches broker's available margin for realistic maxTrade
   - Kelly suggests amount but never blocks below 1 lot
   - If 1 lot costs more than Kelly budget, override and allow 1 lot

## Pending/Backlog
- **P0**: Desktop app build trigger (frontend-build ready)
- **P2**: Multi-broker support (Zerodha, Angel One, etc.)
- **P3**: News fetcher refactoring

## Key Files
- `/app/desktop/routes/lib/signal_generator.js` — Trade execution with smart sizing
- `/app/desktop/routes/lib/position_sizing.js` — Kelly Criterion calculation
- `/app/desktop/routes/news.js` — News fetch with guard-first AI analysis
- `/app/desktop/routes/lib/telegram.js` — Telegram alerts (fixed formatters)
- `/app/frontend/src/hooks/useAppState.js` — State management hook
- `/app/frontend/src/App.js` — Refactored main UI (134 lines)

## Test Reports
- `/app/test_reports/iteration_45.json` — v15.0.0 App.js refactoring (100%)
- `/app/test_reports/iteration_46.json` — v15.0.0 Telegram/Guard bug fixes (100%)
