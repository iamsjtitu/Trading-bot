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
- **PWA:** Installable as desktop/mobile app

## Architecture
```
/app/
├── backend/
│   ├── server.py              # FastAPI API routes
│   ├── upstox_service.py      # Upstox OAuth, market data, orders, portfolio
│   ├── news_service.py        # News fetching (NewsAPI/Alpha Vantage/Demo)
│   ├── sentiment_service.py   # AI sentiment analysis
│   ├── trading_engine.py      # Paper trading simulation
│   ├── settings_manager.py    # Settings CRUD via MongoDB
│   └── tests/
├── frontend/
│   ├── public/
│   │   ├── manifest.json      # PWA manifest
│   │   ├── service-worker.js  # PWA service worker
│   │   ├── icon-192.png       # PWA icon
│   │   └── icon-512.png       # PWA icon
│   └── src/
│       ├── App.js             # Main dashboard
│       └── components/
│           ├── MarketTicker.js
│           ├── RiskPanel.js
│           ├── NewsFeed.js
│           ├── TradesList.js
│           ├── SignalsList.js
│           ├── AutoTradingSettings.js
│           ├── PositionCalculator.js
│           ├── TradeHistory.js
│           └── SettingsPanel.js
```

## What's Implemented
- [x] Full-stack app (React + FastAPI + MongoDB)
- [x] AI Sentiment Analysis
- [x] Paper Trading Engine
- [x] Real-time Dashboard
- [x] Upstox OAuth Integration (live market data, portfolio, orders)
- [x] Live News API Integration (NewsAPI.org + Alpha Vantage)
- [x] Trade History tab
- [x] Frontend Refactored into components
- [x] **PWA Setup** - Installable as desktop/mobile app

## Backlog
### P0 - Wire AI signals to Upstox order execution
### P1 - Trade analytics with charts (P&L graph, CSV export)
### P2 - Telegram/Email notifications
### P3 - Option chain analysis, multi-strategy, backtesting
