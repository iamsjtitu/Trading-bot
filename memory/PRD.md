# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Final form: standalone desktop app (.exe/.dmg) with auto-update.

## Core Requirements
- **Broker:** Upstox
- **AI Model:** Emergent LLM Key (GPT-4o)
- **News Sources:** NewsAPI.org, Alpha Vantage, Moneycontrol, Economic Times, NSE India
- **Trading:** Intraday, weekly expiry. Paper + Live mode switchable
- **Risk:** Configurable limits, stop-loss, emergency stop
- **Desktop App:** Electron (.exe/.dmg), auto-update via GitHub releases

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Backend (Desktop):** Node.js Express + JSON file DB
- **Desktop:** Electron + electron-builder + electron-updater
- **CI/CD:** GitHub Actions (Node.js 18 pinned)

## What's Implemented
- Dashboard with real-time market ticker, risk panel, portfolio cards
- News feed with AI sentiment analysis (multi-source)
- Trading signals generation from news
- Paper trading engine with auto-exit/entry
- Live Upstox integration (OAuth, orders, portfolio, positions)
- LIVE vs PAPER mode switching with proper data isolation
- Trade history with filtering
- Trade analytics with Chart.js
- Capital gains tax reporting (PDF/Excel export)
- Desktop notification via Telegram
- Auto square-off warning near market close
- Historical pattern matching for AI decisions
- Desktop app build pipeline (CI/CD)
- Auto-updater for desktop app

## Bug Fixes Completed (March 18, 2026)
1. **P0 - Market Status Indicator:** Fixed MarketTicker to show correct status based on Upstox connection + market hours
2. **P0 - LIVE Mode Data Mismatch:** Fixed both desktop (Node.js) and web (Python) backends - Active Trades now fetches real Upstox positions in LIVE mode, portfolio shows live funds, no paper data leakage
3. **P0 - Market Data 0.00:** Upgraded from `/market-quote/ltp` to `/market-quote/quotes` endpoint for full OHLC data. Fixed close price field parsing (was `close_price`, now `ohlc.close`/`cp` with fallback chain). Added robust key matching.
4. **P1 - HTML Tags in News:** Applied strip_html to all news sources (NewsAPI, Alpha Vantage) + frontend safety net

## Key Files
### Frontend
- `/app/frontend/src/App.js` - Main app with mode logic, displayTrades/displayPortfolio
- `/app/frontend/src/components/MarketTicker.js` - Market status with Upstox-aware logic
- `/app/frontend/src/components/NewsFeed.js` - News with cleanText() HTML stripping
- `/app/frontend/src/components/SignalsList.js` - Trading signals with LIVE mode banner
- `/app/frontend/src/components/TradesList.js` - Active trades with live/paper isolation
- `/app/frontend/src/components/RiskPanel.js` - Risk panel with disconnected badge

### Desktop Backend (Node.js)
- `/app/desktop/routes/portfolio.js` - Portfolio + combined-status (fixed market data + live portfolio)
- `/app/desktop/routes/upstox.js` - Upstox API routes (fixed market quote endpoint)
- `/app/desktop/routes/trading.js` - Trades (fixed to fetch Upstox positions in LIVE mode)
- `/app/desktop/main.js` - Electron shell + Express server

### Web Backend (Python)
- `/app/backend/server.py` - FastAPI backend
- `/app/backend/upstox_service.py` - Upstox API integration (fixed market data parsing)
- `/app/backend/news_service.py` - News fetching + HTML stripping

## Pending/Upcoming Tasks
### P0
- MCX & Commodities Trading (user requested)

### P1
- End-to-end Telegram notification testing (needs user credentials)
- AI model decision-making enhancements

### P2 (Backlog)
- Additional broker support
- Advanced analytics & filtering on Trade History
- CI/CD pipeline robustness improvements

## Version
- Desktop: v1.3.3
- Frontend: v0.1.0
