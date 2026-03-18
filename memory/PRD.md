# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Final form: standalone desktop app (.exe/.dmg) with auto-update.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Backend (Desktop):** Node.js Express + JSON file DB
- **Desktop:** Electron + electron-builder + electron-updater

## What's Implemented

### Core Trading Features
- AI Decision Engine (multi-signal, market regime, dynamic sizing, sector rotation)
- Auto-Entry: Signal → Live order placement via broker (LIVE mode) + paper trade tracking
- Auto-Exit: Real-time SL/target monitoring for both paper and live positions
- 500ms ultra-fast market data polling (`/api/market-data/quick`) + WebSocket support
- 9 News sources with AI sentiment analysis
- Multi-instrument: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY

### Multi-Broker Support (v1.5.0)
- 6 brokers: Upstox, Zerodha, Angel One, 5paisa, Paytm Money, IIFL
- Broker abstraction layer (`broker_base.py`)
- Broker selector in Settings

### Option Chain with Greeks (v1.5.0+)
- Black-Scholes: Delta, Gamma, Theta, Vega, Rho
- 9 instruments (6 index + 3 MCX: CRUDEOIL, GOLD, SILVER)
- PCR, Max Pain, ATM IV summary

### OI Buildup Alerts (v1.5.1)
- Support/Resistance from max OI strikes
- PCR-based bullish/bearish signals
- Long/Short Buildup detection (CE/PE)
- Max Pain proximity alerts
- Severity-coded (HIGH/MEDIUM/LOW)

## Key API Endpoints
- `/api/market-data/quick` - Ultra-fast market prices (500ms polling)
- `/api/combined-status` - Full dashboard data
- `/api/option-chain/{instrument}` - Option chain with greeks
- `/api/option-chain/oi-buildup/{instrument}` - OI buildup alerts
- `/api/brokers/list` | `/api/brokers/set-active` - Broker management
- `/api/instruments` | `/api/instruments/set` - Trading instrument
- `/api/auto-exit/check` - Paper + live exit monitoring
- `/api/news/fetch` - News fetch + signal generation

## Pending Tasks
### P1
- Desktop rebuild (.exe/.dmg) with v1.5.1
- Telegram notifications e2e testing
- Test auto-entry/exit with real Upstox credentials

### P2
- MCX commodities actual trade execution
- Real-time option chain with broker WebSocket data
- Advanced Trade History analytics

## Version: 1.5.1

## Changelog
### v1.5.1 (March 18, 2026)
- Ultra-fast market data: 500ms polling via /api/market-data/quick (lightweight, no auth check)
- Auto-Entry fixed: Signal generation now triggers live broker orders in LIVE mode
- Auto-Exit fixed: Monitors live positions for SL/target and places exit orders
- OI Buildup Alerts: Support/Resistance, PCR signals, Long/Short Buildup, Max Pain proximity
- trading_engine now has trading_mode and broker_service for live execution

### v1.5.0 (March 18, 2026)
- Multi-Broker: Upstox, Zerodha, Angel One, 5paisa, Paytm Money, IIFL
- Option Chain: Black-Scholes greeks for 9 instruments (6 index + 3 MCX)

### v1.4.0 (March 18, 2026)
- Upstox WebSocket integration for push-based market data

### v1.3.6 (March 18, 2026)
- 3 new news sources (NDTV Profit, CNBC TV18, Livemint)
- Multi-instrument trading (4 instruments)
