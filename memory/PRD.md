# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses GPT-4o for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Standalone desktop application for Windows/Mac with auto-updates.

## Architecture (v7.0.0)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: Node.js/Express (port 8002, proxied through Python FastAPI on 8001)
- **Desktop**: Electron | **AI**: GPT-4o via Emergent LLM Key
- **Broker**: Upstox API v2 (LIVE mode) | **Database**: Local JSON (lowdb)
- **Notifications**: Telegram Bot (@T2_kridha_bot, Chat ID: 5861330845)

## v7.0.0 Features (All Verified, iteration_40)

### AI Features:
1. **AI Sentiment Analysis** - GPT-4o analyzes news from 8 sources
2. **AI Exit Advisor** - 3 min auto-check + manual "Ask AI" button. Syncs LIVE prices from Upstox.
3. **AI Morning Briefing** - 9:00 AM IST weekdays, personalized with GPT-4o market outlook
4. **Smart Position Sizing (Kelly Criterion)** - 3 modes, mode-filtered, works in LIVE
5. **Options Greeks & IV Filter** - Black-Scholes, smart IV, volatility smile

### 8 AI Loss Prevention Guards (all with Telegram alerts on block):
1-8: Multi-Timeframe, Market Regime, Trailing SL, Multi-Source News, Time-of-Day, Max Daily Loss (Always ON), Kelly (Toggle), Greeks (Toggle)

### Telegram Alerts (7 types, individually toggleable):
1. New Signals, 2. Trade Entry, 3. Trade Exit, 4. Daily P&L Summary, 5. Guard Blocks, 6. Exit Advisor, 7. Morning Briefing

### Infrastructure:
- Background Market Data Fetcher (60s)
- Exit Advisor (3 min checks)
- Morning Briefing Scheduler (9:00 AM IST)
- Parallel news from 8 sources
- 13 API routes

## v7.0.0 Bug Fixes (Deep Audit - March 2026)
1. **CRITICAL**: exit_advisor.js P&L operator precedence bug fixed (pos.pnl was divided by 100)
2. **HIGH**: Missing Telegram trade entry alert for LIVE trades now added in signal_generator.js
3. **MEDIUM**: SL/Target in executeLiveTrade now uses actual fill price (not hardcoded 150 premium)
4. **LOW**: Multi-Source Verification guard now sends Telegram guard block alert
5. **LOW**: Multi-Timeframe guard now sends Telegram guard block alert (news.js & trading.js)
6. **COSMETIC**: web_server.js console log version corrected

## Backlog
### P1: App.js refactor (800+ lines monolith)
### P1: Desktop app build trigger for v7.0.0
### P2: Multi-broker (Zerodha, Angel One, 5paisa) - when API keys ready
