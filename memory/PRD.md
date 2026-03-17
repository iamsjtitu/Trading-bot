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

## Completed Tasks
- [x] Full backend rewrite (Python -> Node.js for desktop)
- [x] Live Upstox trading integration
- [x] AI fallback (keyword-based sentiment)
- [x] CI/CD & auto-updates pipeline
- [x] Desktop Notifications
- [x] Trade Analytics with P&L charts
- [x] Telegram support in settings
- [x] Trade Analytics tab added to App.js
- [x] **Enhanced AI Decision-Making** - Multi-factor analysis, sector detection (BANKING/IT/PHARMA/AUTO/ENERGY/METAL/FMCG), trend-aware confidence scoring, weighted keyword analysis, improved AI prompt
- [x] **Advanced Trade History** - Summary stats, date/type/status filters, sortable columns, CSV export, results count
- [x] **Daily P&L Summary via Telegram** - New /api/daily-summary endpoint, /api/telegram/send-daily-summary endpoint, Daily P&L Summary toggle in settings, "Send Daily Summary Now" button
- [x] News Feed sector badges (shows sector like BANKING, AUTO when detected)
- [x] All testing passed: iteration_5.json - 15/15 features PASS, backend 17/17

## Upcoming Tasks (P1)
- Test Telegram Notifications end-to-end (needs user's Bot Token + Chat ID)
- Auto-scheduled daily summary at market close (3:30 PM IST)

## Future/Backlog (P2+)
- Enhance AI decision-making further (historical pattern matching)
- Add support for additional brokers
- More advanced analytics (sector-wise P&L breakdown, heat maps)

## 3rd Party Integrations
- OpenAI GPT-4.1-mini (via Emergent LLM Key)
- Upstox (user API key)
- NewsAPI.org (user API key)
- Alpha Vantage (user API key)
- Telegram (user Bot Token/Chat ID)
- Chart.js for analytics

## Key Files
- `/app/frontend/src/App.js` - Main app with all tabs
- `/app/frontend/src/components/TradeHistory.js` - Enhanced trade history with filters & CSV export
- `/app/frontend/src/components/TradeAnalytics.js` - P&L charts
- `/app/frontend/src/components/SettingsPanel.js` - Settings with Notifications, Telegram, Daily Summary
- `/app/frontend/src/components/NewsFeed.js` - News feed with sector badges
- `/app/backend/server.py` - Python FastAPI backend (web preview)
- `/app/backend/sentiment_service.py` - Enhanced AI sentiment with sector detection & trend scoring
- `/app/desktop/main.js` - Electron main process
- `/app/desktop/routes/news.js` - Node.js news + enhanced AI sentiment
- `/app/desktop/routes/trading.js` - Trading routes + daily summary + telegram
