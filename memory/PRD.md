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
- Dashboard with real-time market ticker
- LIVE vs PAPER mode with proper data isolation
- Auto-Entry: News fetch + signal generation + Upstox order placement
- Auto-Exit: Real-time SL/target monitoring with Upstox sell orders
- News feed with AI sentiment (multi-source, HTML stripped, freshness decay)
- Trade analytics, tax reporting, desktop notifications
- Desktop app auto-updater

### v1.4.0 Features
- **Real-time Upstox WebSocket integration** for push-based market data streaming
  - Backend WebSocket manager (`ws_market_data.py`) connects to Upstox WS
  - FastAPI WebSocket endpoint (`/api/ws/market-data`) relays data to frontend
  - Frontend auto-connects WebSocket in LIVE mode with auto-reconnect
  - Falls back to REST polling if WebSocket unavailable
  - WS status badge in header (WS: Live / WS: Polling)
  - REST endpoints: `/api/ws/status`, `/api/ws/start`, `/api/ws/stop`

### v1.3.6 Features
- **3 New Free News Sources**: NDTV Profit, CNBC TV18, Livemint (9 sources total)
- **Multi-Instrument Trading**: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY
- Settings > Trading tab for instrument selection
- Instrument-aware signal generation

## Key API Endpoints
- `/api/health` - Health check
- `/api/combined-status` - Dashboard data (now includes ws_status)
- `/api/instruments` - List trading instruments
- `/api/instruments/set` - Set active instrument
- `/api/ws/status` - WebSocket streaming status
- `/api/ws/start` - Start WebSocket (requires Upstox token)
- `/api/ws/stop` - Stop WebSocket
- `/api/ws/market-data` - WebSocket endpoint for frontend
- `/api/news/fetch` - Fetch & analyze news
- `/api/trades/execute-live` - Place live Upstox trade
- `/api/ai/insights` - AI Brain dashboard data
- `/api/ai/heatmap-data` - Sentiment heatmap data

## Pending Tasks
### P1
- Desktop rebuild & verification (package v1.4.0 into .exe/.dmg)
- Telegram notifications e2e testing

### P2
- MCX & Commodities Trading
- More broker integrations
- Advanced Trade History analytics

## Version: 1.4.0

## Changelog
### v1.4.0 (March 18, 2026)
- Real-time Upstox WebSocket integration for push-based market data
- WebSocket manager with auto-connect, auto-reconnect, protobuf decoding
- FastAPI WebSocket relay endpoint for frontend
- Frontend WebSocket client with keepalive ping and auto-reconnect
- WS status badge (WS: Live / WS: Polling) in header
- Falls back to REST polling when WS unavailable
- Version bump to 1.4.0

### v1.3.6 (March 18, 2026)
- Added NDTV Profit, CNBC TV18, Livemint as free news sources
- Multi-instrument trading: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY
- New Settings > Trading tab for instrument selection
- Fixed loadUpstoxData temporal dead zone in App.js
- /api/instruments and /api/instruments/set endpoints

### v1.3.5
- Fixed market data auto-refresh (5s interval)
- Auto-entry auto-fetches news when Entry is ON
- News fetch interval reduced to 3 min

### v1.3.4
- Sector Confidence Heatmap in AI Brain tab

### v1.3.3
- Full AI Decision Engine (9 features)
- AI Brain dashboard tab
