# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Final form: standalone desktop app (.exe/.dmg) with auto-update.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Backend (Desktop):** Node.js Express + JSON file DB
- **Desktop:** Electron + electron-builder + electron-updater
- **CI/CD:** GitHub Actions (Node.js 18 pinned)

## What's Implemented

### Core Features
- Full AI Decision Engine (multi-signal correlation, market regime, dynamic sizing, sector rotation, trade review)
- AI Brain dashboard with Confidence Heatmap
- Dashboard with real-time market ticker (WebSocket + polling fallback)
- LIVE vs PAPER mode with proper data isolation
- Auto-Entry/Exit with Upstox order placement
- 9 News sources (Demo, Moneycontrol, ET, NSE, NDTV Profit, CNBC TV18, Livemint, NewsAPI, Alpha Vantage)
- Trade analytics, tax reporting, desktop notifications
- Desktop app auto-updater

### v1.5.0 Features (March 18, 2026)
- **Multi-Broker Support**: 6 brokers with abstraction layer
  - Upstox, Zerodha (Kite Connect), Angel One (SmartAPI), 5paisa, Paytm Money, IIFL Securities
  - Broker selector in Settings > Broker tab
  - Each broker has full implementation: auth, market data, portfolio, orders
  - Persistent active broker selection in MongoDB
  - API: /api/brokers/list, /api/brokers/set-active, /api/brokers/active
- **Option Chain with Greeks**: Full Black-Scholes model
  - 9 instruments: NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, BANKEX (index) + CRUDEOIL, GOLD, SILVER (MCX)
  - Greeks: Delta, Gamma, Theta, Vega, Rho
  - Summary: PCR, Max Pain, ATM IV
  - IV calculator (Newton-Raphson method)
  - New "Option Chain" tab in dashboard
  - API: /api/option-chain/{instrument}, /api/option-chain/greeks, /api/option-chain/iv

### v1.4.0 Features
- Real-time Upstox WebSocket integration for push-based market data
- WebSocket manager, FastAPI relay endpoint, frontend auto-reconnect

### v1.3.6 Features
- 3 new free news sources (NDTV Profit, CNBC TV18, Livemint)
- Multi-instrument trading (NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY)

## Key Files
- `/app/backend/broker_base.py` - Abstract broker interface
- `/app/backend/broker_manager.py` - Broker management & routing
- `/app/backend/brokers/*.py` - Individual broker implementations
- `/app/backend/option_chain_service.py` - Option chain + Greeks calculator
- `/app/backend/ws_market_data.py` - WebSocket market data manager
- `/app/frontend/src/components/OptionChain.js` - Option chain UI
- `/app/frontend/src/components/SettingsPanel.js` - Settings with broker/instrument selection

## Pending Tasks
### P1
- Desktop rebuild & verification (.exe/.dmg with v1.5.0)
- Telegram notifications e2e testing

### P2
- MCX & Commodities Trading (actual trade execution)
- More broker integrations testing with real credentials
- Advanced Trade History analytics

## Version: 1.5.0
