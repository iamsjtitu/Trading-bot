# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot with multi-broker support, AI sentiment analysis, and desktop app delivery.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Backend (Desktop):** Node.js Express (inside Electron)
- **Desktop:** Electron + electron-builder + electron-updater
- **AI:** OpenAI GPT-4o via Emergent LLM Key

## What's Implemented (v3.0.4)

### Multi-Broker Architecture (6 Brokers - FULLY ISOLATED)
- **Upstox** (Active) - OAuth, Orders, Portfolio, Market Data, WebSocket
- **Zerodha** (Kite Connect) - OAuth, Orders, Portfolio, Market Data
- **Angel One** (SmartAPI) - Login+TOTP, Orders, Portfolio, Market Data
- **5paisa** - Login, Orders, Portfolio
- **Paytm Money** - OAuth, Orders, Portfolio
- **IIFL Securities** - Login, Orders
- Per-broker credential storage with isolated tokens

### Auto-Trade (NSE/BSE Instruments)
- AI Signal -> Auto Entry/Exit on ANY selected instrument
- Correct exchange mapping: NSE->NFO, BSE->BFO
- Settings persist across restarts

### 6 Trading Instruments
- NSE: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY
- BSE: SENSEX, BANKEX
- MCX: REMOVED (v3.0.0+)

### Market Status
- NSE/BSE: 9:15 AM - 3:30 PM IST + holidays
- Live countdown timers

### Option Chain - LIVE DATA ONLY
- 6 instruments (NSE/BSE only)
- 3-step check: (1) Market status, (2) Broker connection, (3) Live data fetch
- Desktop backend now parses Upstox data into frontend format with full Greeks
- No simulation fallback - shows market status when data unavailable

### Desktop App
- Electron with auto-updates
- Node.js backend synced with Python backend
- CI/CD via GitHub Actions

### News Sources (11 sources)
- Moneycontrol, Economic Times, NDTV Profit, CNBC TV18, Livemint
- Business Today, The Hindu Business Line, Reuters, Bloomberg
- Additional RSS feeds

## Key Bug Fixes (v3.0.4)
- P0: Trading instrument persistence - fixed key mismatch (trading_instrument used consistently)
- P0: Option Chain desktop backend - added parseLiveChain() to convert raw Upstox data to frontend format with Greeks
- P0: Option Chain error handling - now extracts actual Upstox API error details
- Cleanup: Removed MCX Commodities group from frontend OptionChain.js
- Added MIDCPNIFTY to INDEX_KEYS for quick market data
- Added base_price to all instruments in desktop backend

## Key Bug Fixes (v3.0.3)
- CRITICAL: Fixed JS crash from duplicate variable in extra_apis.js
- CRITICAL: Fixed auto-trade LIVE mode token path
- CRITICAL: Ported 3 missing news scrapers to desktop backend
- Added 2 new news sources (Business Today, Hindu Business Line)
- Removed all MCX functionality
- Separated PAPER/LIVE data in analytics/tax/AI brain
- Prevented AI signals during market closed hours

## Pending Tasks
- P0: User to create new GitHub release for v3.0.4 desktop build
- P1: Full end-to-end user verification on desktop app

## Future/Backlog
- Stock Options trading support
- Enhanced trade analytics and tax reporting
- Telegram notifications integration
- App.js, news.js, trading.js refactoring
