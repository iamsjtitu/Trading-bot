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
- Telegram Notifications support
- Settings panel (Broker, Risk, Schedule, Advanced tabs)
- Auto-updater with in-app banner (Electron)
- Emergency stop button

## Completed Tasks
- [x] Full backend rewrite (Python -> Node.js for desktop)
- [x] Live Upstox trading integration
- [x] AI fallback (keyword-based sentiment)
- [x] CI/CD & auto-updates pipeline
- [x] Desktop Notifications
- [x] Trade Analytics with P&L charts
- [x] Telegram support in settings
- [x] Trade Analytics tab added to App.js (was missing)
- [x] Full end-to-end testing passed (iteration_4.json - 15/15 tests PASS)

## Upcoming Tasks (P1)
- Test Telegram Notifications end-to-end (needs user's Bot Token + Chat ID)

## Future/Backlog (P2+)
- Enhance AI decision-making capabilities
- Add support for additional brokers
- Advanced analytics and filtering on Trade History page

## 3rd Party Integrations
- OpenAI GPT-4.1-mini (via Emergent LLM Key)
- Upstox (user API key)
- NewsAPI.org (user API key)
- Alpha Vantage (user API key)
- Telegram (user Bot Token/Chat ID)
- Chart.js for analytics

## Key Files
- `/app/frontend/src/App.js` - Main app with all tabs
- `/app/frontend/src/components/TradeAnalytics.js` - P&L charts
- `/app/frontend/src/components/SettingsPanel.js` - Settings with Notifications & Telegram
- `/app/frontend/src/components/UpdateBanner.jsx` - Auto-update banner
- `/app/backend/server.py` - Python FastAPI backend (web preview)
- `/app/desktop/main.js` - Electron main process
- `/app/desktop/routes/` - Node.js API routes (desktop)
