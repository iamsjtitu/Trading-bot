# AI Trading Bot - Product Requirements Document

## Problem Statement
User wants an AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and executes options (Call/Put) trades based on signals.

## Core Requirements
- **Broker:** Upstox
- **AI Model:** Emergent LLM Key (GPT-4.1-mini)
- **News Source:** Free APIs (NewsAPI.org, Alpha Vantage) with demo fallback
- **Trading Style:** Intraday, weekly expiry
- **Mode:** Paper Trading simulator (with Live mode UI ready)
- **Risk:** Max trade: 20K, Daily limit: 1L, Medium tolerance, SL automation, Emergency stop
- **User Language:** Hinglish

## Architecture
```
/app/
├── backend/
│   ├── server.py              # FastAPI API routes (all prefixed /api)
│   ├── news_service.py        # News fetching (NewsAPI/Alpha Vantage/Demo)
│   ├── sentiment_service.py   # AI sentiment analysis (GPT-4.1-mini)
│   ├── trading_engine.py      # Paper trading simulation engine
│   ├── settings_manager.py    # Settings CRUD via MongoDB
│   └── tests/                 # Pytest test suite
├── frontend/src/
│   ├── App.js                 # Main dashboard (refactored)
│   └── components/
│       ├── MarketTicker.js    # Live market indices
│       ├── RiskPanel.js       # Risk management panel
│       ├── NewsFeed.js        # News articles with sentiment
│       ├── TradesList.js      # Active trades with live P&L
│       ├── SignalsList.js     # Trading signals display
│       ├── AutoTradingSettings.js  # Auto-exit/entry controls
│       ├── PositionCalculator.js   # Position sizing tool
│       └── SettingsPanel.js   # Full settings modal
```

## DB Schema (MongoDB)
- `bot_settings`: App configuration (trading mode, API keys, risk, schedule, news settings)
- `portfolio`: Capital, P&L, trade statistics
- `paper_trades`: Individual trade records
- `trading_signals`: AI-generated signals
- `news_articles`: Cached news with sentiment

## What's Implemented (as of March 2026)
- [x] Full-stack app (React + FastAPI + MongoDB)
- [x] AI Sentiment Analysis (GPT-4.1-mini via Emergent LLM Key)
- [x] Paper Trading Engine with P&L simulation
- [x] Real-time Dashboard with live market ticker
- [x] Auto-exit, auto-entry, auto-analysis automation
- [x] Comprehensive Settings Panel (Broker/Risk/Schedule/Advanced)
- [x] **Live News API Integration** - NewsAPI.org + Alpha Vantage (reads keys from DB settings)
- [x] **Frontend Refactored** - App.js broken into 7 reusable components
- [x] Emergency stop button
- [x] Position size calculator
- [x] LIVE/PAPER mode indicator

## Backlog
### P0 - Live Broker Integration (Upstox)
- Backend logic to connect to Upstox API for real trade execution
- Requires user's Upstox API credentials
- Switch between paper/live trading in backend

### P1 - Real Market Data
- Replace random market index simulation with real NSE data
- Could use NSE APIs or third-party providers

### P2 - Trade History & Analytics
- Detailed trade history page with filters
- Performance charts (daily P&L, win rate over time)
- Export to CSV

### P3 - Notifications
- Email/Telegram notifications for trade execution
- Daily P&L summary alerts

## Mocked Components
- **Trading Engine**: Paper trading simulation (no real broker)
- **Market Indices**: Randomly generated values
- **News**: Demo articles when no API key configured (real APIs work when keys provided)
