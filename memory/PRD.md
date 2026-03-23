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

## Current Version: v22.0.0

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

## Bug Fixes (v20.0.0 Session)
1. **Trading Instrument Selection Bug (P0)** - FIXED 2026-03-23
   - Root cause: `saveSettings()` sent the stale `trading_instrument` from initial `loadSettings()` back to `/api/settings/update`, overwriting the new instrument set via `/api/instruments/set`
   - Fix: (a) `handleInstrumentChange` now also syncs `settings` state, (b) `saveSettings` strips `trading_instrument` and `active_broker` from the save payload
   - Also fixed duplicate `<TabsContent value="risk">` in JSX

## New Features (v21.0.0)
1. **Manual Trade Entry from Signals** - ADDED 2026-03-23
   - "Enter CALL/PUT Trade" button on each signal card in Signals tab
   - Works in both Paper and Live modes
   - Shows "Already Traded" badge for signals that already have an open trade
   - Toast notification on successful/failed trade execution
   - When Auto Entry is OFF, user can manually pick signals and enter trades
   - Button disabled in LIVE mode when broker is disconnected
2. **Manual Trade Exit with Toast** - ENHANCED 2026-03-23
   - Already existing "Exit" button now shows toast notification on success
   - "Ask AI" button for AI exit advice on each trade
   - Works for both Paper and Live modes
3. **Instrument Change Toast** - ADDED 2026-03-23
   - Shows confirmation toast when trading instrument is changed (e.g., "Switched to Bank Nifty")
4. **Auto Entry/Exit Protection Verified** - 2026-03-23
   - When Auto Entry OFF: Signals generate but no auto-trade execution
   - When Auto Exit OFF: No auto-exit at SL/target, user controls exits manually
   - Backend double-checks settings before any auto-action
5. **API Cost Optimization** - ADDED 2026-03-23
   - Keyword pre-filter: Only market-relevant articles sent to GPT-4o (~70-85% API calls saved)
   - Max articles per cycle: 30 → 10
   - Exit Advisor polling: 60s → 5 min (80% savings)
   - Estimated total API cost reduction: ~75-80%
6. **Manual News Fetch + Analyze** - ADDED 2026-03-23
   - "Fetch Latest News" button: Fetches news from 16 sources WITHOUT AI (FREE)
   - "Analyze with AI" button per article: Single article AI analysis + signal generation
   - Hint text: "Click to generate CALL/PUT signal" for BULLISH/BEARISH articles
   - Backend: `/api/news/fetch-only` and `/api/news/analyze-article` endpoints

## Pending/Backlog
- **P0**: Desktop app build trigger for v20.0.0+ (after instrument bug fix)
- **P1**: Refactor SettingsPanel.js (750+ lines -> smaller components)
- **P2**: Multi-broker support (Zerodha, Angel One, etc.)
- **P3**: Daily performance summary with charts on Telegram
- **P3**: News fetcher refactoring

## Key Files
- `/app/frontend/src/components/SettingsPanel.js` - Settings UI (instrument bug fixed here)
- `/app/desktop/routes/extra_apis.js` - Instruments/brokers/option-chain APIs
- `/app/desktop/routes/settings.js` - Settings CRUD APIs
- `/app/desktop/routes/lib/signal_generator.js` - Trade execution with smart sizing
- `/app/desktop/routes/trading.js` - P&L, auto-exit, position sync
- `/app/frontend/src/hooks/useAppState.js` - State management hook
- `/app/frontend/src/App.js` - Refactored main UI (134 lines)

## Test Reports
- `/app/test_reports/iteration_45.json` - v15.0.0 App.js refactoring
- `/app/test_reports/iteration_46.json` - v15.0.0 Telegram/Guard bug fixes
