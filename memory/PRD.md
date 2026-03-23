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

## Current Version: v15.0.0 (reads dynamically from package.json)

## Version Management (PERMANENT FIX)
- **Single source of truth**: `desktop/package.json` → `version` field
- To bump version: Only change `desktop/package.json` → everything else auto-updates
- `web_server.js`: APP_VERSION from package.json
- `main.js` (Electron): app.getVersion()
- `App.js` (Frontend): Fetches from /api/health
- `SettingsPanel.js`: Generic "latest features" messages
- `trading.js`: Reads from ../package.json

## Completed Features
- AI-powered sentiment analysis (GPT-4o via Emergent LLM Key)
- Live news from 13 sources (Bloomberg, India Today, Reuters, Zee Business, Financial Express, etc.)
- Paper & Live trading modes
- Upstox broker integration
- Real-time market data & Option Chain
- AI Guards (9 safety guards including Max Daily Profit & Max Daily Loss)
- AI Exit Advisor (HOLD/EXIT/PARTIAL_EXIT/TIGHTEN_SL)
- Kelly Criterion position sizing
- Options Greeks & IV analysis
- Telegram alerts (7 alert types)
- AI Morning Briefing (9:00 AM IST weekdays)
- Tax Reporting (CSV export)
- Auto-update mechanism (Electron + GitHub)
- Custom About dialog & footer (9x.Design + Contact)
- Background jobs: Market Data Fetcher, Exit Advisor, Morning Briefing
- Emergency Stop, Trailing SL, Auto re-entry
- Trade Journal with AI reviews
- System Health Dashboard — real-time monitoring of all services
- **App.js Refactoring** (v15.0.0) — Monolithic 830-line App.js split into modular components

## App.js Component Architecture (Refactored)
```
App.js (134 lines) — Main shell, routing, layout
├── hooks/useAppState.js (511 lines) — All state management, API calls, effects
├── components/AppHeader.js — Header toolbar, trading mode badges, buttons
├── components/PortfolioCards.js — 4 portfolio summary cards
├── components/LivePositions.js — Live positions table (LIVE mode only)
├── components/NotificationToasts.js — Notification system
├── components/AppFooter.js — Footer with version and credits
├── components/RiskPanel.js — Risk management panel
├── components/AutoTradingSettings.js — Auto trading config
├── components/AIGuards.js — AI loss prevention guards
├── components/MarketTicker.js — Market indices ticker
├── components/MarketStatusBanner.jsx — NSE/BSE market status
├── components/UpdateBanner.jsx — Auto-update banner
├── components/SettingsPanel.js — Full settings modal
└── (12 tab components: NewsFeed, SignalsList, TradesList, etc.)
```

## Changelog
- v1.0-v6.0: Core features built
- v7.0.0: Deep audit, 7 bug fixes
- v7.0.1: Version refs fixed
- v8.0.0: Permanent version fix, added missing routes to main.js
- v9.0.1: Bloomberg RSS, RiskPanel fix, Journal mode filter
- v10.0.0: 5 new news sources (13 total), 30 articles/cycle
- v11.0.0-v14.0.0: Critical live trading bug fixes, P&L sync, Max Daily Loss guard
- v15.0.0: Max Daily Profit guard, App.js refactoring, desktop build prep

## Desktop Build
- Frontend built and copied to `desktop/frontend-build/`
- Build guide at `desktop/BUILD_GUIDE.md`
- electron-builder configured for Windows (NSIS) and Mac (DMG)
- Auto-update via GitHub Releases (iamsjtitu/Trading-bot)

## Pending/Backlog
- **P0**: Desktop app build trigger (frontend-build ready, user needs to run electron-builder locally with GH_TOKEN)
- **P2**: Multi-broker support (Zerodha, Angel One, 5paisa, Paytm Money, IIFL)
- **P3**: News fetcher refactoring into source-specific modules

## Key Files
- `/app/desktop/package.json` — VERSION SOURCE OF TRUTH (v15.0.0)
- `/app/desktop/main.js` — Electron main, 13 routes, 3 background jobs
- `/app/desktop/web_server.js` — Express server, APP_VERSION
- `/app/desktop/routes/` — All API route modules
- `/app/frontend/src/App.js` — Refactored main UI (134 lines)
- `/app/frontend/src/hooks/useAppState.js` — State management hook
- `/app/frontend/src/components/` — All UI components
- `/app/desktop/BUILD_GUIDE.md` — Desktop build instructions

## Test Reports
- `/app/test_reports/iteration_40.json` — v7.0.0 (100%)
- `/app/test_reports/iteration_41.json` — v8.0.0 (100%)
- `/app/test_reports/iteration_42.json` — v8.1.0 (100%)
- `/app/test_reports/iteration_43.json` — v10.0.0 news expansion
- `/app/test_reports/iteration_44.json` — v14.0.0 live trading fixes
- `/app/test_reports/iteration_45.json` — v15.0.0 App.js refactoring (100%)
