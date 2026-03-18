# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Final form: standalone desktop app (.exe/.dmg) with auto-update.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Backend (Desktop):** Node.js Express + JSON file DB
- **Desktop:** Electron + electron-builder + electron-updater
- **CI/CD:** GitHub Actions (Node.js 18 pinned)

## What's Implemented

### Core Trading
- Dashboard with real-time market ticker, risk panel, portfolio cards
- Paper trading engine with auto-exit/entry
- Live Upstox integration (OAuth, orders, portfolio, positions)
- LIVE vs PAPER mode switching with proper data isolation
- Trade history with filtering

### AI Decision Engine (ENHANCED - March 18, 2026)
- **Multi-Signal Correlation**: Aggregates signals from last 30 min, computes correlation score based on direction/sector alignment
- **Market Regime Detection**: TRENDING_UP/DOWN, SIDEWAYS, VOLATILE, MIXED classification from 4h sentiment distribution + confidence variance
- **Multi-Timeframe Sentiment**: Tracks 1hr, 4hr, daily windows with confluence scoring (0-100)
- **Dynamic Position Sizing**: Kelly Criterion-inspired sizing factoring confidence, win rate, regime multiplier, sector performance, drawdown protection
- **Sector Rotation Tracker**: Monitors bullish/bearish momentum per sector, identifies leaders/laggards
- **AI-Powered Trade Review**: Post-trade analysis using GPT for learning insights
- **News Freshness Decay**: Exponential decay (60-min half-life) for news relevance
- **Enhanced AI Prompt**: 8-factor analysis framework with market context injection
- **Composite Scoring**: Weighted score = 35% AI Confidence + 20% Correlation + 20% Confluence + 15% Freshness + 10% Historical
- **Regime-Aware Thresholds**: VOLATILE requires 75%+ confidence, SIDEWAYS 70%, CLOSING_HOUR 80%
- **AI Brain Dashboard**: New tab showing regime, sector rotation, performance, timeframe depth, decision factor weights
- Enhanced signal cards showing composite score, correlation, confluence, freshness, volatility, sector badges

### News & Sentiment
- News feed with AI sentiment analysis (multi-source: NewsAPI, Alpha Vantage, Moneycontrol, ET)
- HTML stripping on all sources + frontend safety net
- News deduplication
- Trading signals generation from news with composite scoring

### Analytics & Reports
- Trade analytics with Chart.js
- Capital gains tax reporting (PDF/Excel export)

### Desktop & Notifications
- Electron desktop app build pipeline (CI/CD)
- Auto-updater for desktop app
- Telegram desktop notifications
- Auto square-off warning near market close

## Bug Fixes Completed (March 18, 2026)
1. P0 - Market Status Indicator: Fixed with Upstox-aware logic
2. P0 - LIVE Mode Data Mismatch: Both backends fixed - no paper data leakage
3. P0 - Market Data 0.00: Upgraded to full market quote API + correct field parsing
4. P1 - HTML Tags in News: strip_html on all sources + frontend cleanText()

## Key Files
- `/app/backend/ai_engine.py` - Python AI Decision Engine
- `/app/backend/sentiment_service.py` - Enhanced sentiment with AI engine
- `/app/backend/server.py` - FastAPI + /api/ai/insights endpoint
- `/app/desktop/routes/ai_engine.js` - Node.js AI Decision Engine
- `/app/desktop/routes/news.js` - Enhanced analyzeSentiment + signal generation
- `/app/desktop/routes/trading.js` - Trading + AI trade review
- `/app/frontend/src/components/AIInsights.js` - AI Brain dashboard
- `/app/frontend/src/components/SignalsList.js` - Enhanced signal cards

## Pending/Upcoming Tasks
### P0
- MCX & Commodities Trading

### P1
- Telegram notification e2e testing
- Desktop app rebuild + test with Upstox

### P2
- Additional broker support
- Advanced trade history analytics
- CI/CD pipeline stability

## Version: Desktop v1.3.4

## Changelog
### v1.3.4 (March 18, 2026)
- Added Sector Confidence Heatmap to AI Brain tab
- Shows sector-wise sentiment breakdown across 6 time buckets (last 24 hours)
- Color-coded cells: Green (Bullish), Red (Bearish), Yellow (Mixed)
- New `/api/ai/heatmap` endpoint (both Python + Node.js backends)

### v1.3.3 (March 18, 2026)
- Full AI Decision Engine: Multi-Signal Correlation, Market Regime Detection, Multi-Timeframe Sentiment, Dynamic Position Sizing, Sector Rotation, AI Trade Review, News Freshness Decay
- AI Brain dashboard tab
- Enhanced signal cards with composite scoring

### v1.3.2
- Bug fixes: Market status, LIVE mode data isolation, HTML tags in news
- Market data API upgrade to full quotes endpoint
