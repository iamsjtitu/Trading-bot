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

## Current Version: v8.0.0 (reads dynamically from package.json)

## Version Management (PERMANENT FIX - v8.0.0)
- **Single source of truth**: `desktop/package.json` → `version` field
- `web_server.js`: Reads `APP_VERSION` from `package.json`
- `main.js` (Electron): Uses `app.getVersion()` (auto-reads package.json)
- `App.js` (Frontend): Fetches version from `/api/health` endpoint at startup
- `SettingsPanel.js`: Uses generic "latest features" in error messages
- `trading.js`: Reads version from `../package.json`
- **To bump version**: Only change `desktop/package.json` → everything else auto-updates

## Completed Features (All verified & working)
- AI-powered sentiment analysis (GPT-4o)
- Live news from 11 sources (CNBC TV18, Livemint, Business Today, Hindu Business Line, etc.)
- Paper & Live trading modes
- Upstox broker integration
- Real-time market data & Option Chain
- AI Guards (8 safety guards: Multi-TF, Market Regime, Trailing SL, Multi-Source, Time-of-Day, Max Daily Loss, Kelly Sizing, Greeks Filter)
- AI Exit Advisor (HOLD/EXIT/PARTIAL_EXIT/TIGHTEN_SL recommendations)
- Kelly Criterion position sizing
- Options Greeks & IV analysis
- Telegram alerts (7 alert types: Signals, Trade Entry, Trade Exit, Daily P&L, Guard Blocks, Exit Advisor, Morning Briefing)
- AI Morning Briefing on Telegram (9:00 AM IST weekdays)
- Tax Reporting (CSV export)
- Auto-update mechanism (Electron + GitHub releases)
- Custom About dialog & footer content (9x.Design + Contact)
- Background jobs: Market Data Fetcher, Exit Advisor, Morning Briefing
- Emergency Stop functionality
- Trailing Stop Loss
- Auto re-entry after target hit
- Trade Journal with AI reviews

## Changelog
- [2026-03] v1.0-v6.0: Core features built
- [2026-03] v7.0.0: Deep audit, 7 bug fixes (P&L calc, Telegram alerts, SL/Target prices)
- [2026-03] v7.0.1: Version bump + SettingsPanel.js version references fixed
- [2026-03] v8.0.0: **CRITICAL FIXES**:
  - Permanent version fix: All files now read from package.json (no more hardcoded versions)
  - Fixed main.js missing `telegram` + `options` routes (was loading 11/13, now 13/13)
  - Fixed main.js not starting background jobs (Market Data Fetcher, Exit Advisor, Morning Briefing)
  - Fixed web_server.js hardcoded version strings → uses APP_VERSION from package.json
  - Fixed App.js hardcoded version → fetches dynamically from /api/health
  - Fixed SettingsPanel.js hardcoded version in error messages → generic "latest features"
  - Fixed trading.js stale version '4.0.1' → reads from package.json
  - Full testing: 19 backend tests + frontend verification = 100% pass (iteration_41.json)

## Pending/Backlog
- **P0**: Desktop app rebuild for v8.0.0 (critical fixes will take effect in desktop)
- **P1**: Refactor App.js (800+ lines) into smaller components
- **P2**: Multi-broker support (Zerodha, Angel One, 5paisa, Paytm Money, IIFL)

## Key Files
- `/app/desktop/package.json` — **VERSION SOURCE OF TRUTH** (v8.0.0)
- `/app/desktop/main.js` — Electron main, routes (13), background jobs, About dialog
- `/app/desktop/web_server.js` — Express server, APP_VERSION from package.json
- `/app/desktop/routes/telegram.js` — Telegram setup, test, alerts, daily-summary, morning-briefing
- `/app/desktop/routes/options.js` — Greeks, IV, position sizing
- `/app/desktop/routes/trading.js` — Trades, auto-exit, signals, AI guards, exit advisor
- `/app/desktop/routes/news.js` — News fetch, sentiment, auto-entry
- `/app/desktop/routes/lib/` — Signal generator, exit advisor, morning briefing, market data fetcher, telegram, greeks, position sizing
- `/app/frontend/src/App.js` — Main UI, dynamic version from API
- `/app/frontend/src/components/SettingsPanel.js` — Settings, Telegram config

## 3rd Party Integrations
- OpenAI GPT-4o via Emergent LLM Key
- Upstox API v2
- Telegram Bot API

## Test Reports
- `/app/test_reports/iteration_40.json` — v7.0.0 final verification (100%)
- `/app/test_reports/iteration_41.json` — v8.0.0 version fix + route fix verification (100%)
