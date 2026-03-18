# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Final form: standalone desktop app (.exe/.dmg) with auto-update.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Desktop:** Electron + electron-builder + electron-updater
- **AI:** OpenAI GPT-4o via Emergent LLM Key

## What's Implemented (v1.8.0)

### Core Trading
- AI Decision Engine + Auto-Entry (signal -> live broker order) + Auto-Exit (SL/target monitoring)
- 500ms ultra-fast market data polling (ISOLATED useEffect)
- Auto-entry/exit settings persist across restarts (loaded from MongoDB at startup)
- 9 News sources, AI sentiment analysis, signal generation with logging

### Market Status Indicator (NEW in v1.8.0)
- Real-time market open/close detection (IST timezone)
- Indian public holidays (NSE/BSE) for 2025-2026
- Live countdown timer to next open/close
- Pre-open session detection (9:00-9:15 AM IST)
- Upcoming holidays API

### 9 Trading Instruments
- NSE: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY
- BSE: SENSEX, BANKEX
- MCX: CRUDEOIL, GOLD, SILVER

### 6 Broker Integrations
- Upstox, Zerodha, Angel One, 5paisa, Paytm Money, IIFL
- Broker abstraction layer + Settings selector

### Option Chain + Greeks + OI Buildup Alerts
- Black-Scholes greeks, live broker data with simulated fallback
- Auto-refresh toggle (2s), PCR, Max Pain, OI Buildup detection

## Key Bug Fixes (v1.7.0)
- Market data polling isolated into separate useEffect
- Auto-entry settings loaded at startup from MongoDB
- Settings broker connection uses active broker API
- Immediate news fetch when auto-entry turned ON
- Signal generation logging
- CI/CD NSIS install - 3x retry + SourceForge fallback

## Pending User Verification
- Auto-Refresh fix (market data updating in real-time in LIVE mode)
- Auto-Entry/Exit fix (live trades being placed when enabled)

## Upcoming Tasks
- P1: Rebuild Desktop App (.exe/.dmg) after user confirms bug fixes
- P2: Stock Options trading support
- P2: Trade analytics enhancement
- P3: Telegram notifications integration
- P3: App.js refactoring (large component)

## Version: 1.8.0
