# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot with multi-broker support, AI sentiment analysis, and desktop app delivery.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Backend (Desktop):** Node.js Express (inside Electron)
- **Desktop:** Electron + electron-builder + electron-updater
- **AI:** OpenAI GPT-4o via Emergent LLM Key

## What's Implemented (v3.0.7)

### Multi-Broker Architecture (6 Brokers)
- Upstox (Active), Zerodha, Angel One, 5paisa, Paytm Money, IIFL
- Per-broker credential storage with isolated tokens

### 6 Trading Instruments (NSE/BSE only, MCX removed)
- NSE: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY
- BSE: SENSEX, BANKEX
- ALL expiry: TUESDAY (NSE moved from Thursday to Tuesday in Aug 2025)

### Option Chain - LIVE DATA
- Fetches ACTUAL nearest expiry from Upstox `/v2/option/contract` API
- Falls back to calculated Tuesday if API unavailable
- Caches expiry for 30 minutes to reduce API calls
- Parses raw Upstox data with full Greeks (IV, Delta, Gamma, Theta, Vega)

### Auto-Trade
- Uses correct expiry date from Upstox API for instrument lookup
- Dynamic strike price calculation based on actual market spot price
- Proper instrument key mapping for all 6 instruments
- Error handling with trade status tracking

### News Sources (11 sources)
- Moneycontrol, Economic Times, NDTV Profit, CNBC TV18, Livemint
- Business Today, The Hindu Business Line, Reuters, Bloomberg + RSS

### Desktop App
- Electron with auto-updates (v3.0.7)
- Node.js backend synced with Python backend
- CI/CD via GitHub Actions

## Key Bug Fixes (v3.0.7) - CRITICAL
- ROOT CAUSE: NSE moved ALL derivatives expiry from Thursday to TUESDAY (Aug 2025)
- Option Chain was sending wrong expiry_date (Thursday) → Upstox returned empty data
- Now fetches ACTUAL nearest expiry from Upstox `/v2/option/contract` endpoint
- Auto-trade executeLiveTrade() and executeLiveAutoEntry() also fixed
- Fixed broken fallback instrument token construction (referenced deleted variable)
- Both Python and Node.js backends updated

## Previous Fixes
- v3.0.6: Version display, diagnostics endpoint, dynamic strike prices
- v3.0.5: Added expiry_date parameter (required by Upstox API)
- v3.0.4: parseLiveChain(), error handling, MCX cleanup
- v3.0.3: JS crash fix, token path fix, missing scrapers, data separation

## Pending
- P0: User to build v3.0.7 and test option chain + auto-trade
- P1: Full end-to-end verification

## Future/Backlog
- Stock Options trading support
- Telegram notifications
- Code refactoring (App.js, news.js, trading.js)
- Enhanced analytics & tax reports
