# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses GPT-4o for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Standalone desktop application for Windows/Mac with auto-updates.

## Architecture (v5.0.0)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: Node.js/Express (port 8002, proxied through Python FastAPI on 8001)
- **Desktop**: Electron | **AI**: GPT-4o via Emergent LLM Key
- **Broker**: Upstox API v2 (LIVE mode) | **Database**: Local JSON (lowdb)

## v5.0.0 - Background Market Data Fetcher (Verified, iteration_35)

### New Features:
1. **Background Market Data Fetcher** - Auto-caches live spot prices for all 6 indices (Nifty, BankNifty, FinNifty, MidcapNifty, Sensex, Bankex) every 60 seconds during market hours (9:00 AM - 3:45 PM IST, weekdays only). Greeks filter and Kelly Criterion now get real-time accurate data instead of stale fallback values.
2. **Collapsible AI Guards Panel** - Show/Hide dropdown matching Auto-Trading Settings pattern.
3. **Version bumped to v5.0.0**

### New API Endpoints:
- `GET /api/market-data/bg-status` - Background fetcher status, market hours, cached indices

### Files:
- `/app/desktop/routes/lib/market_data_fetcher.js` (NEW)
- `/app/desktop/web_server.js` (MODIFIED - starts fetcher, version 5.0.0)
- `/app/frontend/src/components/AIGuards.js` (MODIFIED - collapsible dropdown)

## v4.8.0 - Options Greeks & Kelly Criterion (Deep Verified)

### Features:
1. **Smart Position Sizing (Kelly Criterion)** - Dynamic trade sizing. 3 modes: Conservative/Balanced/Aggressive.
2. **Options Greeks & IV Filter** - Black-Scholes greeks, smart IV estimation, OTM smile adjustment.

### Bug Fixes in v4.8.0:
1. Kelly ignored in LIVE trades → Fixed (uses suggested_amount to cap budget)
2. Kelly mixing PAPER+LIVE stats → Fixed (mode-filtered)
3. Greeks hardcoded IV 15% → Fixed (instrument-specific + smile)
4. Spot price fallback warnings → Added

## v4.7.0 - AI Loss Prevention Suite (Verified)

### 8 AI Guards:
1. Multi-Timeframe Confirmation
2. Market Regime Filter
3. Trailing Stop Loss
4. Multi-Source News Verification
5. Time-of-Day Filter
6. Max Daily Loss Auto-Stop (Always ON)
7. Smart Position Sizing - Kelly (Toggle)
8. Options Greeks & IV Filter (Toggle)

## Current Settings
- SL: 15% | Target: 25% (1.7:1 ratio) | Min Confidence: 70%
- Max Daily Loss: 5,000 | Max Open Trades: 5 | Auto-Entry: OFF
- Kelly Mode: Balanced | Greeks Filter: ON

## Backlog
### P1: Desktop build v5.0.0
### P2: Stock Options, Telegram, Backtesting, Dark Mode, PDF Export, App.js refactor
### P3: Multi-broker (Zerodha, Angel One, 5paisa)
