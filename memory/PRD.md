# AI Trading Bot - Product Requirements Document

## Problem Statement
AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and executes options (Call/Put) trades based on signals via Upstox broker.

## Core Requirements
- **Broker:** Upstox (OAuth integration with daily token refresh)
- **AI Model:** Emergent LLM Key (GPT-4.1-mini)
- **News Source:** NewsAPI.org / Alpha Vantage / Demo fallback
- **Trading Style:** Intraday, weekly expiry
- **Mode:** Paper Trading simulator + Live mode via Upstox
- **Risk:** Max trade: 20K, Daily limit: 1L, Medium tolerance, SL automation, Emergency stop
- **User Language:** Hinglish

## Architecture
```
/app/
├── backend/
│   ├── server.py              # FastAPI API routes (all prefixed /api)
│   ├── upstox_service.py      # Upstox OAuth, market data, orders, portfolio
│   ├── news_service.py        # News fetching (NewsAPI/Alpha Vantage/Demo)
│   ├── sentiment_service.py   # AI sentiment analysis (GPT-4.1-mini)
│   ├── trading_engine.py      # Paper trading simulation engine
│   ├── settings_manager.py    # Settings CRUD via MongoDB
│   └── tests/                 # Pytest test suite (38 tests)
├── frontend/src/
│   ├── App.js                 # Main dashboard (uses live data when connected)
│   └── components/
│       ├── MarketTicker.js    # Live market indices (real when Upstox connected)
│       ├── RiskPanel.js       # Risk management panel
│       ├── NewsFeed.js        # News articles with sentiment
│       ├── TradesList.js      # Active trades with live P&L
│       ├── SignalsList.js     # Trading signals display
│       ├── AutoTradingSettings.js  # Auto-exit/entry controls
│       ├── PositionCalculator.js   # Position sizing tool
│       ├── TradeHistory.js    # Upstox order book / trade history
│       └── SettingsPanel.js   # Full settings with Upstox OAuth flow
```

## Key API Endpoints
### Existing
- `GET /api/health`, `GET /api/portfolio`, `GET /api/stats`
- `GET /api/news/fetch`, `GET /api/news/latest`
- `GET /api/signals/latest`, `GET /api/signals/active`
- `GET /api/trades/active`, `GET /api/trades/today`, `GET /api/trades/history`
- `GET /api/settings`, `POST /api/settings/update`
- `POST /api/auto-exit/check`, `POST /api/auto-settings/update`

### Upstox Integration (New)
- `GET /api/upstox/auth-url` - Generate OAuth login URL
- `POST /api/upstox/callback` - Exchange auth code for token
- `GET /api/upstox/connection` - Check connection status
- `GET /api/upstox/profile` - User profile
- `GET /api/upstox/market-data` - Live NIFTY/SENSEX/BankNifty prices
- `GET /api/upstox/portfolio` - Real positions & funds
- `POST /api/upstox/order` - Place order
- `DELETE /api/upstox/order/{id}` - Cancel order
- `GET /api/upstox/orders` - Order book
- `GET /api/combined-status` - Unified dashboard data (auto-switches paper/live)

## What's Implemented
- [x] Full-stack app (React + FastAPI + MongoDB)
- [x] AI Sentiment Analysis (GPT-4.1-mini via Emergent LLM Key)
- [x] Paper Trading Engine with P&L simulation
- [x] Real-time Dashboard with live market ticker
- [x] Auto-exit, auto-entry, auto-analysis automation
- [x] Comprehensive Settings Panel
- [x] Live News API Integration (NewsAPI.org + Alpha Vantage)
- [x] Frontend Refactored into 9 components
- [x] **Upstox OAuth Integration** - Complete login flow
- [x] **Live Market Data** - Real NIFTY/SENSEX from Upstox when connected
- [x] **Live Portfolio** - Real positions, funds, margin from Upstox
- [x] **Order Placement** - Place/cancel orders via Upstox API
- [x] **Trade History** - Order book from Upstox
- [x] **Connection Status** - Shows connected/disconnected in UI
- [x] **Combined Status API** - Auto-switches between paper/live data

## Backlog
### P0 - Auto-Trade Execution via Upstox
- Trading engine should place real Upstox orders when in LIVE mode
- Currently the bot generates signals and paper trades; need to wire signal → Upstox order

### P1 - Trade Analytics & Charts
- Performance charts (daily P&L over time, win rate trends)
- Export trade data to CSV
- Visual analytics dashboard

### P2 - Telegram/Email Notifications
- Trade execution alerts
- Daily P&L summary

### P3 - Advanced Features
- Option chain analysis
- Multi-strategy support
- Backtesting engine
