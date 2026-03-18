# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Final form: standalone desktop app (.exe/.dmg) with auto-update.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Backend (Desktop):** Node.js Express (inside Electron)
- **Desktop:** Electron + electron-builder + electron-updater
- **AI:** OpenAI GPT-4o via Emergent LLM Key

## What's Implemented (v2.0.0)

### Core Trading
- AI Decision Engine + Auto-Entry + Auto-Exit (signal-based trading)
- 500ms ultra-fast market data polling
- Auto-entry/exit settings persist across restarts
- 9 News sources, AI sentiment analysis, signal generation

### Market Status Indicator
- Real-time market open/close detection (IST timezone)
- Indian public holidays (NSE/BSE) for 2025-2026 (34 holidays)
- Live countdown timer to next open/close
- Pre-open session detection (9:00-9:15 AM IST)

### 9 Trading Instruments (with MCX Live Data)
- NSE: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY
- BSE: SENSEX, BANKEX
- MCX: CRUDEOIL, GOLD, SILVER
- All instruments visible in Market Ticker, Option Chain, and WebSocket

### Option Chain + Greeks
- 1-second auto-refresh
- Black-Scholes greeks calculation
- 9 instruments with 2 groups (Index Options + MCX Commodities)
- OI Buildup Alerts (Support/Resistance, Long/Short Buildup, Max Pain)

### 6 Broker Integrations
- Upstox (active), Zerodha, Angel One, 5paisa, Paytm Money, IIFL
- Broker switching with connection re-check

### Desktop Backend Sync
- All missing API endpoints ported to Node.js desktop backend
- market-status, market-data/quick, instruments, brokers, option-chain, auto-entry/status

### CI/CD
- NSIS PATH fix for Windows build
- 3x retry + SourceForge fallback

## Bug Fixes (v2.0.0)
- Option Chain instruments dropdown was empty (API format mismatch: array vs object)
- Python backend instrument key changed: NIFTY → NIFTY50 (consistent across all systems)
- Auto-refresh changed from 2s to 1s
- Broker descriptions added for Settings UI
- MCX commodity data added to market ticker, WebSocket, and all data endpoints
- Auto-entry/exit settings now persist in desktop backend

## Pending User Verification
- Auto-Refresh fix (market data updating in real-time in LIVE mode)
- Auto-Entry/Exit fix (live trades being placed when enabled)

## Upcoming Tasks
- P1: Rebuild Desktop App (.exe/.dmg) - push to GitHub, tag v2.0.0
- P2: Stock Options trading support
- P2: Trade analytics enhancement
- P3: Telegram notifications integration
- P3: App.js refactoring

## Version: 2.0.0
