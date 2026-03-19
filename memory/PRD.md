# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot with multi-broker support, AI sentiment analysis, and desktop app delivery.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Backend (Desktop):** Node.js Express (inside Electron)
- **Desktop:** Electron + electron-builder + electron-updater
- **AI:** OpenAI GPT-4o via Emergent LLM Key

## What's Implemented (v3.0.5)

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
- Live trade uses proper Upstox option chain lookup with expiry_date
- Correct instrument key mapping for all 6 instruments

### 6 Trading Instruments
- NSE: NIFTY50 (Thu expiry), BANKNIFTY (Wed), FINNIFTY (Tue), MIDCPNIFTY (Mon)
- BSE: SENSEX (Fri), BANKEX (Mon)
- MCX: REMOVED (v3.0.0+)

### Market Status
- NSE/BSE: 9:15 AM - 3:30 PM IST + holidays
- Live countdown timers

### Option Chain - LIVE DATA ONLY
- 6 instruments (NSE/BSE only)
- 3-step check: (1) Market status, (2) Broker connection, (3) Live data fetch
- Sends required `expiry_date` parameter to Upstox API (YYYY-MM-DD)
- Desktop backend parses Upstox data into frontend format with full Greeks
- No simulation fallback - shows market status when data unavailable

### Desktop App
- Electron with auto-updates (v3.0.5)
- Node.js backend synced with Python backend
- CI/CD via GitHub Actions

### News Sources (11 sources)
- Moneycontrol, Economic Times, NDTV Profit, CNBC TV18, Livemint
- Business Today, The Hindu Business Line, Reuters, Bloomberg
- Additional RSS feeds

## Key Bug Fixes (v3.0.5)
- P0: Option Chain 400 error - Added `expiry_date` parameter (REQUIRED by Upstox API)
- P0: Auto-trade live execution - Fixed expiry_date, instrument key mapping, and fallback token
- P0: executeLiveAutoEntry() - Now uses option chain lookup with proper expiry
- Added getNextExpiry() utility for weekly expiry calculation per instrument
- Both Python and Node.js backends now pass expiry_date to Upstox API

## Key Bug Fixes (v3.0.4)
- P0: Trading instrument persistence - fixed key mismatch
- P0: Option Chain desktop backend - added parseLiveChain() with Greeks
- P0: Option Chain error handling - extracts actual Upstox API error details
- Removed MCX Commodities group from frontend
- Added MIDCPNIFTY to INDEX_KEYS, base_price to all instruments

## Key Bug Fixes (v3.0.3)
- CRITICAL: Fixed JS crash from duplicate variable in extra_apis.js
- CRITICAL: Fixed auto-trade LIVE mode token path
- CRITICAL: Ported 3 missing news scrapers to desktop backend
- Added 2 new news sources (Business Today, Hindu Business Line)
- Removed all MCX functionality
- Separated PAPER/LIVE data in analytics/tax/AI brain

## Pending Tasks
- P0: User to create new GitHub release for v3.0.5 desktop build
- P1: Full end-to-end user verification on desktop app (option chain + auto-trade)

## Future/Backlog
- Stock Options trading support
- Enhanced trade analytics and tax reporting
- Telegram notifications integration
- App.js, news.js, trading.js refactoring
