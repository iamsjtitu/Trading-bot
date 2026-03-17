# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Final form: standalone desktop application (.exe/.dmg) with auto-updates.

## Architecture
- **Web Preview**: React frontend + FastAPI (Python) backend + MongoDB
- **Desktop App**: React frontend + Node.js/Express backend + Electron + JSON file DB
- **CI/CD**: GitHub Actions for building .exe/.dmg releases

## All Completed Tasks
- [x] Full backend rewrite (Python -> Node.js for desktop)
- [x] Live Upstox trading integration
- [x] AI fallback (keyword-based sentiment)
- [x] CI/CD & auto-updates pipeline
- [x] Desktop Notifications
- [x] Trade Analytics with P&L charts
- [x] Telegram support in settings + Daily P&L Summary
- [x] Enhanced AI Decision-Making (multi-factor, sector detection, trend-aware)
- [x] Advanced Trade History (filters, sort, CSV export)
- [x] LIVE mode dashboard fix (Risk Management, Portfolio show Upstox data)
- [x] **Market Closed status** - Shows "MARKET CLOSED" badge outside 9:15 AM - 3:30 PM IST
- [x] **Duplicate news deduplication** - Same news won't appear twice in feed
- [x] **Live auto-exit fix** - Uses real Upstox prices + places sell orders (not random simulation)
- [x] **Auto square-off warning** - Telegram warning at 3:15 PM IST if positions open
- [x] **Historical pattern matching** - Tracks trade outcomes, adjusts AI confidence for future signals
- [x] **Market hours check** - No signals generated when market is closed

## Upcoming Tasks (P1)
- Test Telegram end-to-end with real Bot Token + Chat ID

## Future/Backlog (P2+)
- Additional brokers support
- Sector-wise P&L breakdown, heat maps
- More advanced historical pattern analysis

## Key Files
- `/app/frontend/src/App.js` - Main app with square-off scheduler
- `/app/frontend/src/components/MarketTicker.js` - Market open/closed detection
- `/app/frontend/src/components/RiskPanel.js` - LIVE badge, Upstox labels
- `/app/frontend/src/components/TradeHistory.js` - Upstox orders + filters
- `/app/backend/server.py` - Python backend with all endpoints
- `/app/backend/sentiment_service.py` - Enhanced AI with sector + trend
- `/app/desktop/routes/news.js` - News dedup, AI, signal generation with pattern matching
- `/app/desktop/routes/trading.js` - Live auto-exit, square-off, historical patterns
