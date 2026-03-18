# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Final form: standalone desktop app (.exe/.dmg) with auto-update.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Desktop:** Electron + electron-builder + electron-updater

## What's Implemented (v1.7.0)

### Core Trading
- AI Decision Engine + Auto-Entry (signal → live broker order) + Auto-Exit (SL/target monitoring)
- 500ms ultra-fast market data polling (ISOLATED useEffect - won't get killed by state changes)
- Auto-entry/exit settings persist across restarts (loaded from MongoDB at startup)
- 9 News sources, AI sentiment analysis, signal generation with logging

### 9 Trading Instruments
- NSE: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY
- BSE: SENSEX, BANKEX
- MCX: CRUDEOIL, GOLD, SILVER (with correct exchange mapping MCX→MCX)

### 6 Broker Integrations
- Upstox, Zerodha, Angel One, 5paisa, Paytm Money, IIFL
- Broker abstraction layer + Settings selector

### Option Chain + Greeks + OI Buildup Alerts
- Black-Scholes greeks, live broker data with simulated fallback
- Auto-refresh toggle (2s), PCR, Max Pain, OI Buildup detection

## Key Bug Fixes (v1.7.0)
- **Market data polling isolated** into separate useEffect (was being killed by 13-dep useEffect)
- **Auto-entry settings loaded at startup** from MongoDB (was defaulting to False)
- **Settings broker connection** now uses active broker API (was hardcoded to Upstox)
- **Immediate news fetch** when auto-entry is turned ON
- **Signal generation logging** - shows WHY signals pass or fail
- **CI/CD NSIS install** - 3x retry + SourceForge fallback

## Version: 1.7.0
