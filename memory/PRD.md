# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on multiple brokers. Desktop app (.exe/.dmg) with auto-update.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Backend (Desktop):** Node.js Express (inside Electron)
- **Desktop:** Electron + electron-builder + electron-updater
- **AI:** OpenAI GPT-4o via Emergent LLM Key

## What's Implemented (v2.2.0)

### Multi-Broker Architecture (6 Brokers - FULLY IMPLEMENTED)
- **Upstox** (Primary, Active) - OAuth, Orders, Portfolio, Market Data, WebSocket
- **Zerodha** (Kite Connect) - OAuth, Orders, Portfolio, Market Data
- **Angel One** (SmartAPI) - Login, Orders, Portfolio, Market Data
- **5paisa** - Login, Orders, Portfolio
- **Paytm Money** - OAuth, Orders, Portfolio
- **IIFL Securities** - Login, Orders
- Generic broker routing: all operations go through active broker
- Broker switching updates trading engine in real-time
- Desktop Node.js backend: full broker_router.js with all 6 brokers

### Auto-Trade (All Instruments including MCX)
- AI Signal → Auto Entry on ANY selected instrument
- Auto Exit with SL/Target monitoring
- Correct exchange mapping: NSE→NFO, BSE→BFO, MCX→MCX
- Settings persist across restarts

### 9 Trading Instruments
- NSE: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY
- BSE: SENSEX, BANKEX
- MCX: CRUDEOIL, GOLD, SILVER
- All in Market Ticker, Option Chain, WebSocket, Auto-Trade

### Market Status (Dual Indicator)
- NSE/BSE: 9:15 AM - 3:30 PM IST
- MCX: 9:00 AM - 11:30 PM IST
- Indian public holidays (34 for 2025-2026)
- Live countdown timers

### Option Chain + Greeks (1s Refresh)
- 9 instruments in 2 groups (Index + MCX)
- Black-Scholes simulation fallback
- OI Buildup Alerts

### CI/CD
- NSIS PATH fix for Windows build
- 3x retry + SourceForge fallback

## Key API Endpoints
- `/api/brokers/list` - All 6 brokers
- `/api/brokers/set-active` - Switch broker
- `/api/brokers/auth-url` - Active broker's OAuth URL
- `/api/brokers/callback` - Exchange token
- `/api/brokers/connection` - Check connection
- `/api/broker/profile` - Active broker profile
- `/api/broker/portfolio` - Active broker portfolio
- `/api/broker/order` - Place order via active broker
- `/api/broker/orders` - Order book
- `/api/market-status` - NSE + MCX status
- `/api/option-chain/:instrument` - Option chain data

## Pending User Verification
- Auto-Refresh fix in LIVE mode
- Auto-Entry/Exit with live broker

## Upcoming Tasks
- P1: Desktop App Rebuild (.exe/.dmg) - push to GitHub, tag v2.2.0
- P2: Stock Options trading
- P2: Trade analytics
- P3: Telegram notifications
- P3: App.js refactoring

## Version: 2.2.0
