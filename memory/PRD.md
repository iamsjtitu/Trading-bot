# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Final form: standalone desktop application (.exe/.dmg) with auto-updates.

## Architecture
- **Web Preview**: React frontend + FastAPI (Python) backend + MongoDB
- **Desktop App**: React frontend + Node.js/Express backend + Electron + JSON file DB
- **CI/CD**: GitHub Actions for building .exe/.dmg releases

## Core Features (All Implemented)
- Real-time dashboard with portfolio cards, market ticker, risk management
- AI sentiment analysis (GPT-4o via Emergent LLM Key + keyword fallback)
- Paper Trading & Live Trading (Upstox) modes
- News fetching from: Moneycontrol, Economic Times, NSE India, NewsAPI, Alpha Vantage
- Auto-trading (auto-exit, auto-entry, auto-analysis)
- Trade Analytics page with P&L charts (Chart.js)
- Desktop Notifications (signal/entry/exit events)
- Telegram Notifications support + Daily P&L Summary
- Settings panel (Broker, Risk, Schedule, Advanced tabs)
- Auto-updater with in-app banner (Electron)
- Emergency stop button
- **Mode-aware dashboard: LIVE mode shows Upstox live data, PAPER mode shows paper data**
- **Enhanced AI with sector detection, trend-aware confidence, weighted keywords**
- **Advanced Trade History with filters, sort, CSV export**

## Completed Tasks
- [x] Full backend rewrite (Python -> Node.js for desktop)
- [x] Live Upstox trading integration
- [x] AI fallback (keyword-based sentiment)
- [x] CI/CD & auto-updates pipeline
- [x] Desktop Notifications
- [x] Trade Analytics with P&L charts
- [x] Telegram support in settings
- [x] Enhanced AI Decision-Making (multi-factor, sector, trend)
- [x] Advanced Trade History (filters, sort, CSV export, summary stats)
- [x] Daily P&L Summary via Telegram
- [x] **LIVE mode dashboard fix** - Risk Management, Portfolio cards, Trade History now show Upstox live data when connected
- [x] **Fallback for LIVE mode when Upstox disconnected** - shows paper data instead of zeros

## Upcoming Tasks (P1)
- Test Telegram Notifications end-to-end (needs user's Bot Token + Chat ID)
- Auto-scheduled daily summary at market close (3:30 PM IST)

## Future/Backlog (P2+)
- Historical pattern matching for AI
- Additional brokers support
- Sector-wise P&L breakdown, heat maps

## Key Files
- `/app/frontend/src/App.js` - Main app - mode-aware data loading
- `/app/frontend/src/components/RiskPanel.js` - LIVE badge, Upstox labels
- `/app/frontend/src/components/TradeHistory.js` - Upstox orders view in LIVE mode
- `/app/frontend/src/components/TradeAnalytics.js` - P&L charts
- `/app/frontend/src/components/SettingsPanel.js` - Telegram + Daily Summary
- `/app/backend/server.py` - Python backend
- `/app/backend/sentiment_service.py` - Enhanced AI
- `/app/desktop/routes/` - Node.js routes (desktop)
