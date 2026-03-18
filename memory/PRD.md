# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Final form: standalone desktop app (.exe/.dmg) with auto-update.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Desktop:** Electron + electron-builder + electron-updater

## What's Implemented (v1.6.0)

### Core Trading
- AI Decision Engine (multi-signal, market regime, dynamic sizing, sector rotation)
- Auto-Entry: Signal → Live order placement via broker (LIVE mode) + paper trade
- Auto-Exit: SL/target monitoring for paper + live positions
- 500ms ultra-fast market data polling + WebSocket support
- 9 News sources with AI sentiment

### 9 Trading Instruments
- **NSE Index**: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY
- **BSE Index**: SENSEX, BANKEX
- **MCX Commodities**: CRUDEOIL, GOLD, SILVER
- Exchange mapping: NSE→NFO, BSE→BFO, MCX→MCX for live orders

### 6 Broker Integrations
- Upstox, Zerodha, Angel One, 5paisa, Paytm Money, IIFL

### Option Chain with Greeks
- Black-Scholes: Delta, Gamma, Theta, Vega, Rho, IV
- All 9 instruments supported (6 index + 3 MCX)
- Live broker data → fallback to simulated
- Auto-refresh toggle (2s interval)
- LIVE DATA / SIMULATED badge

### OI Buildup Alerts
- Support/Resistance from max OI
- PCR bullish/bearish signals
- Long/Short Buildup detection
- Max Pain proximity alerts

## Pending Tasks
### P1
- Desktop rebuild (.exe/.dmg) v1.6.0
- Telegram notifications e2e testing
- Test auto-entry/exit with real Upstox credentials

### P2
- Advanced Trade History analytics
- Stock F&O options support

## Version: 1.6.0
