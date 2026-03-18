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
- **Backend (Primary):** Python FastAPI + MongoDB
- **Desktop:** Electron + electron-builder + electron-updater
- **Database:** MongoDB (web) / JSON file (desktop)
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
1. **P0 - Market Status Indicator:** Fixed MarketTicker to show "LIVE MARKET" when Upstox connected OR during market hours
2. **P0 - LIVE Mode Data Mismatch:** Active Trades tab now shows Upstox live positions when connected. Signals tab shows LIVE mode banner
3. **P1 - HTML Tags in News:** Applied strip_html to all news sources (NewsAPI, Alpha Vantage) + frontend safety net

## Pending/Upcoming Tasks
### P0
- MCX & Commodities Trading (user requested, pending after bug fixes)

### P1
- End-to-end Telegram notification testing (needs user credentials)
- AI model decision-making enhancements

### P2 (Backlog)
- Additional broker support
- Advanced analytics & filtering on Trade History
- CI/CD pipeline robustness improvements

## 3rd Party Integrations
- OpenAI GPT-4o-mini (Emergent LLM Key)
- Upstox API (User credentials)
- NewsAPI.org / Alpha Vantage (User API keys)
- Web scraping: Moneycontrol, Economic Times
- Electron / electron-builder / electron-updater
- Chart.js, jspdf, exceljs
- Telegram Bot API (User credentials)

## Key Files
- `/app/frontend/src/App.js` - Main app with mode logic
- `/app/frontend/src/components/MarketTicker.js` - Market status
- `/app/frontend/src/components/NewsFeed.js` - News with HTML cleaning
- `/app/frontend/src/components/SignalsList.js` - Trading signals
- `/app/frontend/src/components/TradesList.js` - Active trades
- `/app/backend/server.py` - FastAPI backend
- `/app/backend/news_service.py` - News fetching + HTML stripping
- `/app/backend/upstox_service.py` - Upstox API integration
