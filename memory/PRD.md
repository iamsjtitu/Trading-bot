# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot with multi-broker support, AI sentiment analysis, and desktop app delivery.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Backend (Desktop):** Node.js Express (inside Electron)
- **Desktop:** Electron + electron-builder + electron-updater
- **AI:** OpenAI GPT-4o via Emergent LLM Key

## What's Implemented (v2.3.0)

### Multi-Broker Architecture (6 Brokers - FULLY ISOLATED)
- **Upstox** (Active) - OAuth, Orders, Portfolio, Market Data, WebSocket
- **Zerodha** (Kite Connect) - OAuth, Orders, Portfolio, Market Data
- **Angel One** (SmartAPI) - Login+TOTP, Orders, Portfolio, Market Data
- **5paisa** - Login, Orders, Portfolio
- **Paytm Money** - OAuth, Orders, Portfolio
- **IIFL Securities** - Login, Orders
- **Per-broker credential storage**: Each broker has its own api_key, api_secret, token
- **No cross-contamination**: Switching brokers shows EMPTY credentials, correct connection status
- Generic broker routing through broker_manager

### Auto-Trade (All Instruments including MCX)
- AI Signal → Auto Entry/Exit on ANY selected instrument
- Correct exchange mapping: NSE→NFO, BSE→BFO, MCX→MCX
- Settings persist across restarts

### 9 Trading Instruments
- NSE: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY
- BSE: SENSEX, BANKEX
- MCX: CRUDEOIL, GOLD, SILVER (in Market Ticker, Option Chain, WebSocket, Auto-Trade)

### Market Status (Dual Indicator)
- NSE/BSE: 9:15 AM - 3:30 PM IST + 34 holidays (2025-2026)
- MCX: 9:00 AM - 11:30 PM IST
- Live countdown timers

### Option Chain + Greeks (1s Refresh)
- 9 instruments in 2 groups (Index + MCX Commodities)
- Black-Scholes simulation fallback

## Key Bug Fixes (v2.3.0)
- CRITICAL: Per-broker credential isolation (each broker has own api_key, api_secret, token)
- CRITICAL: Broker switching no longer shows Upstox data for other brokers
- MCX exchange mapping in auto-exit orders
- All Upstox-hardcoded labels replaced with dynamic broker names

## Upcoming Tasks
- P1: Desktop App Rebuild (.exe/.dmg) - push to GitHub, tag v2.3.0
- P2: Stock Options trading
- P2: Trade analytics
- P3: Telegram notifications

## Version: 2.3.0
