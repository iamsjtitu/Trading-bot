# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Final form: standalone desktop app (.exe/.dmg) with auto-update.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Backend (Desktop):** Node.js Express (inside Electron)
- **Desktop:** Electron + electron-builder + electron-updater
- **AI:** OpenAI GPT-4o via Emergent LLM Key

## What's Implemented (v1.8.0)

### Core Trading
- AI Decision Engine + Auto-Entry + Auto-Exit (signal-based trading)
- 500ms ultra-fast market data polling
- Auto-entry/exit settings persist across restarts
- 9 News sources, AI sentiment analysis, signal generation

### Market Status Indicator (v1.8.0)
- Real-time market open/close detection (IST timezone)
- Indian public holidays (NSE/BSE) for 2025-2026 (34 holidays)
- Live countdown timer to next open/close
- Pre-open session detection (9:00-9:15 AM IST)
- Upcoming holidays API

### Desktop Backend Sync (v1.8.0 CRITICAL FIX)
- Added `/api/market-status` and `/api/market-holidays` to desktop Node.js backend
- Added `/api/market-data/quick` for fast data polling
- Added `/api/auto-entry/status` for auto-trade monitoring
- Added `/api/instruments` and `/api/instruments/set` for instrument management
- Added `/api/brokers/list`, `/api/brokers/set-active`, `/api/brokers/active`, `/api/brokers/connection`
- Added `/api/option-chain/:instrument` with Black-Scholes simulation
- Added `/api/oi-buildup-alerts` and `/api/ws/status`
- Fixed auto-entry/exit settings loading from saved data on startup
- Fixed auto-settings persistence when toggled

### 9 Trading Instruments
- NSE: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY
- BSE: SENSEX, BANKEX
- MCX: CRUDEOIL, GOLD, SILVER

### 6 Broker Integrations
- Upstox (active), Zerodha, Angel One, 5paisa, Paytm Money, IIFL (coming soon)

### Option Chain + Greeks + OI Buildup Alerts
- Black-Scholes greeks, live broker data with simulated fallback

### CI/CD Fix (v1.8.0)
- NSIS PATH fix: always scans 4 known install locations after install
- Uses both `$env:PATH` and `GITHUB_PATH` for robust PATH resolution

## Desktop App File Structure
```
desktop/routes/
├── settings.js        # Settings CRUD
├── portfolio.js       # Portfolio + combined-status  
├── news.js            # News fetch + AI sentiment + signals + trades
├── trading.js         # Trades, auto-exit/entry, tax reports
├── upstox.js          # Upstox broker integration
├── tax.js             # Tax reporting
├── ai_engine.js       # AI Decision Engine
├── market_status.js   # NEW: Market hours + holidays
└── extra_apis.js      # NEW: Instruments, brokers, option chain, quick data
```

## Pending User Verification
- Auto-Refresh fix in LIVE mode
- Auto-Entry/Exit fix with live broker

## Upcoming Tasks
- P1: Rebuild Desktop App (.exe/.dmg) - push to GitHub, tag v1.8.0
- P2: Stock Options trading support
- P2: Trade analytics enhancement
- P3: Telegram notifications integration
- P3: App.js refactoring

## Version: 1.8.0
