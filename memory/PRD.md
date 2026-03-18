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
- Full AI Decision Engine (multi-signal correlation, market regime, dynamic sizing, sector rotation, trade review)
- AI Brain dashboard with Confidence Heatmap
- Dashboard with real-time market ticker (auto-refresh every 5s in LIVE mode using net_change for % change)
- LIVE vs PAPER mode with proper data isolation (no paper data leak)
- Auto-Entry: News fetch + signal generation + Upstox order placement (executeLiveTrade)
- Auto-Exit: Real-time SL/target monitoring with Upstox sell orders
- News feed with AI sentiment (multi-source, HTML stripped, freshness decay)
- Trade analytics, tax reporting, Telegram notifications, desktop app auto-updater
- **Multi-Instrument Trading**: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY with instrument-specific lot sizes, strike steps, and premiums
- **9 News Sources**: Demo, Moneycontrol, Economic Times, NSE India, NDTV Profit, CNBC TV18, Livemint, NewsAPI.org, Alpha Vantage

## Key Fixes (v1.3.6 - March 18, 2026)
1. **3 New News Sources**: NDTV Profit (feedburner RSS), CNBC TV18 (RSS), Livemint (RSS) - all free, no API key needed
2. **Multi-Instrument Trading**: 4 instruments supported with Settings > Trading tab for selection
3. **loadUpstoxData TDZ fix**: Moved useCallback before loadData to prevent "Cannot access before initialization" error
4. **Instrument-aware signals**: Signals now use active instrument's lot_size, strike_step, option_premium

## Pending Tasks
### P0
- None

### P1
- Desktop rebuild & verification (package new features into .exe/.dmg)
- Telegram e2e testing

### P2
- MCX & Commodities Trading
- More broker integrations
- Advanced Trade History analytics

## Version: Desktop v1.3.6

## Changelog
### v1.3.6 (March 18, 2026)
- Added NDTV Profit, CNBC TV18, Livemint as free news sources
- Multi-instrument trading: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY
- New Settings > Trading tab for instrument selection
- Fixed loadUpstoxData temporal dead zone in App.js
- Instrument-specific lot sizes, strike steps, premiums in signal generation
- /api/instruments and /api/instruments/set endpoints

### v1.3.5 (March 18, 2026)
- Fixed market data auto-refresh (5s interval, useCallback, loadUpstoxData dependency)
- Fixed 0.00% change: use net_change from Upstox API instead of ohlc.close
- Auto-entry now auto-fetches news when Entry is ON (even if Auto Analyze is off)
- News fetch interval reduced to 3 min for faster signal generation
- Added tax route for desktop app
- Version bump

### v1.3.4 (March 18, 2026)
- Sector Confidence Heatmap in AI Brain tab
- /api/ai/heatmap endpoint

### v1.3.3 (March 18, 2026)
- Full AI Decision Engine (9 features)
- AI Brain dashboard tab
- Enhanced signal cards

### v1.3.2 (March 18, 2026)
- Bug fixes: Market status, LIVE mode data isolation, HTML tags, market data API
