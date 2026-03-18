# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot with multi-broker support, AI sentiment analysis, and desktop app delivery.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Backend (Desktop):** Node.js Express (inside Electron)
- **Desktop:** Electron + electron-builder + electron-updater
- **AI:** OpenAI GPT-4o via Emergent LLM Key

## What's Implemented (v2.5.0)

### Multi-Broker Architecture (6 Brokers - FULLY ISOLATED)
- **Upstox** (Active) - OAuth, Orders, Portfolio, Market Data, WebSocket
- **Zerodha** (Kite Connect) - OAuth, Orders, Portfolio, Market Data
- **Angel One** (SmartAPI) - Login+TOTP, Orders, Portfolio, Market Data
- **5paisa** - Login, Orders, Portfolio
- **Paytm Money** - OAuth, Orders, Portfolio
- **IIFL Securities** - Login, Orders
- **Per-broker credential storage**: Each broker has its own api_key, api_secret, token
- Generic broker routing through broker_manager

### Auto-Trade (All Instruments including MCX)
- AI Signal -> Auto Entry/Exit on ANY selected instrument
- Correct exchange mapping: NSE->NFO, BSE->BFO, MCX->MCX
- Settings persist across restarts

### 9 Trading Instruments
- NSE: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY
- BSE: SENSEX, BANKEX
- MCX: CRUDEOIL, GOLD, SILVER

### Market Status (Dual Indicator)
- NSE/BSE: 9:15 AM - 3:30 PM IST + 34 holidays (2025-2026)
- MCX: 9:00 AM - 11:30 PM IST
- Live countdown timers

### Option Chain - LIVE DATA ONLY (v2.5.0)
- 9 instruments in 2 groups (Index + MCX Commodities)
- **No more Black-Scholes simulation fallback**
- 3-step check: (1) Market status, (2) Broker connection, (3) Live data fetch
- source='market_closed' when market is closed with next opening time
- source='broker_disconnected' when broker not connected with instructions
- source='broker_error' when broker returns error with retry option
- source='live' only when live data is successfully fetched
- OI Buildup Alerts also respect market status
- Upstox option chain API fixed for MCX (MCX_FO) and BSE (BSE_INDEX) instruments

### Desktop App
- Electron with auto-updates
- Node.js backend synced with Python backend
- CI/CD via GitHub Actions

## Key Bug Fixes (v2.5.0)
- P0: Option Chain no longer shows simulated data - shows market status messages instead
- P0: Upstox option chain instrument key fixed for MCX and BSE exchanges  
- P0: OI Buildup Alerts respect market hours
- Desktop option chain route updated to check market status (no more simulation)

## Key Bug Fixes (v2.4.0)
- CRITICAL: Per-broker credential isolation
- CRITICAL: Desktop backend synchronized with Python backend
- MCX live data via dynamic instrument key resolution
- CI/CD build fix for Windows (makensis PATH)

## Pending Tasks
- P1: User verification of all fixes in live environment
- P2: Desktop app rebuild (.exe/.dmg) after user confirmation

## Future/Backlog
- Stock Options trading support
- Enhanced trade analytics and tax reporting
- Telegram notifications integration
- App.js component refactoring
