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

## Version Management (PERMANENT FIX)
- **Single source of truth**: `desktop/package.json` → `version` field
- `web_server.js`: APP_VERSION from package.json
- `main.js` (Electron): app.getVersion()
- Frontend: Fetches from /api/health

## Completed Features
- AI-powered sentiment analysis (GPT-4o via Emergent LLM Key)
- Live news from 13 sources (Bloomberg, India Today, Reuters, Zee Business, Financial Express, etc.)
- Paper & Live trading modes
- Upstox broker integration with P&L sync
- Real-time market data & Option Chain
- AI Guards (9 safety guards including Max Daily Profit & Max Daily Loss)
- AI Exit Advisor (HOLD/EXIT/PARTIAL_EXIT/TIGHTEN_SL)
- Kelly Criterion position sizing
- Options Greeks & IV analysis
- Telegram alerts (7 alert types) with anti-spam cooldown
- AI Morning Briefing (9:00 AM IST weekdays)
- Tax Reporting (CSV export)
- Auto-update mechanism (Electron + GitHub)
- Background jobs: Market Data Fetcher, Exit Advisor, Morning Briefing
- Emergency Stop, Trailing SL, Auto re-entry
- Trade Journal with AI reviews
- System Health Dashboard
- **App.js Refactoring** — 830-line monolith split into modular components
- **Guard-First AI Analysis** — Daily Profit/Loss guards block AI calls to save API balance
- **Telegram Anti-Spam** — 30-min cooldown per guard type for notifications

## App.js Component Architecture (Refactored)
```
App.js (134 lines) — Main shell, routing, layout
├── hooks/useAppState.js (512 lines) — State management, API calls, effects
├── components/AppHeader.js — Header toolbar, badges, buttons
├── components/PortfolioCards.js — 4 portfolio summary cards
├── components/LivePositions.js — Live positions table (LIVE mode only)
├── components/NotificationToasts.js — Notification system
├── components/AppFooter.js — Footer with version and credits
└── (12 tab components + settings, market ticker, risk panel, etc.)
```

## Bug Fixes (Latest Session)
1. **Telegram "New Signal: undefined"** — Fixed formatSignalAlert to use signal_type instead of trade_type
2. **AI balance waste on guard hit** — Added early guard check in news.js BEFORE AI analysis loop
3. **Telegram guard block spam** — Added 30-min cooldown per guard in notifyGuardBlock()

## Changelog
- v1.0-v6.0: Core features built
- v7.0.0: Deep audit, 7 bug fixes
- v8.0.0: Permanent version fix, added missing routes to main.js
- v9.0.1: Bloomberg RSS, RiskPanel fix, Journal mode filter
- v10.0.0: 5 new news sources (13 total), 30 articles/cycle
- v11.0.0-v14.0.0: Critical live trading bug fixes, P&L sync, Max Daily Loss guard
- v15.0.0: Max Daily Profit guard, App.js refactoring, desktop build prep
- v15.0.0 (fixes): Telegram undefined fix, Guard-first AI analysis, Telegram cooldown

## Pending/Backlog
- **P0**: Desktop app build trigger (frontend-build ready, user needs electron-builder locally)
- **P2**: Multi-broker support (Zerodha, Angel One, 5paisa, Paytm Money, IIFL)
- **P3**: News fetcher refactoring into source-specific modules

## Key Files
- `/app/desktop/package.json` — VERSION SOURCE OF TRUTH (v15.0.0)
- `/app/desktop/main.js` — Electron main, 13 routes, 3 background jobs
- `/app/desktop/routes/news.js` — News fetch with guard-first AI analysis
- `/app/desktop/routes/lib/telegram.js` — Telegram alerts (fixed formatters)
- `/app/desktop/routes/lib/signal_generator.js` — Signal generation with cooldown
- `/app/desktop/routes/lib/sentiment.js` — AI sentiment analysis with logging
- `/app/frontend/src/App.js` — Refactored main UI (134 lines)
- `/app/frontend/src/hooks/useAppState.js` — State management hook
- `/app/desktop/BUILD_GUIDE.md` — Desktop build instructions

## Test Reports
- `/app/test_reports/iteration_45.json` — v15.0.0 App.js refactoring (100%)
- `/app/test_reports/iteration_46.json` — v15.0.0 Telegram/Guard bug fixes (100%, 9/9 backend, all frontend)
