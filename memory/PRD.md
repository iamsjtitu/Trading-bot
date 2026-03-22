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

## Current Version: v8.1.0 (reads dynamically from package.json)

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
- Live news from 11 sources
- Paper & Live trading modes
- Upstox broker integration
- Real-time market data & Option Chain
- AI Guards (8 safety guards)
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
- **System Health Dashboard** (v8.1.0) — real-time monitoring of all services

## Changelog
- v1.0-v6.0: Core features built
- v7.0.0: Deep audit, 7 bug fixes
- v7.0.1: Version refs fixed
- v8.0.0: Permanent version fix, added missing telegram+options routes to main.js, added missing background jobs to main.js
- **v8.1.0**: System Health Dashboard tab — shows background services, connections, AI guards, telegram alerts, system info. Auto-refreshes every 10s. Double verified (38/38 tests passed, iteration_42.json)

## Pending/Backlog
- **P0**: Desktop app rebuild for v8.1.0
- **P1**: Refactor App.js (800+ lines) into smaller components
- **P2**: Multi-broker support (Zerodha, Angel One, 5paisa, Paytm Money, IIFL)
- `/app/desktop/package.json` — VERSION SOURCE OF TRUTH
- `/app/desktop/main.js` — Electron main, 13 routes, 3 background jobs, About dialog
- `/app/desktop/web_server.js` — Express server, APP_VERSION
- `/app/desktop/routes/telegram.js` — Telegram routes
- `/app/desktop/routes/options.js` — Greeks, IV, position sizing
- `/app/desktop/routes/trading.js` — Trades, auto-exit, guards, advisor
- `/app/desktop/routes/news.js` — News fetch, sentiment, auto-entry

## Key Files
- `/app/desktop/routes/lib/` — All lib modules
- `/app/frontend/src/App.js` — Main UI, tabs, dynamic version
- `/app/frontend/src/components/SystemHealth.js` — NEW: System Health Dashboard
- `/app/frontend/src/components/SettingsPanel.js` — Settings, Telegram

## Test Reports
- `/app/test_reports/iteration_40.json` — v7.0.0 (100%)
- `/app/test_reports/iteration_41.json` — v8.0.0 (100%)
- `/app/test_reports/iteration_42.json` — v8.1.0 double verification (100%, 38/38)
