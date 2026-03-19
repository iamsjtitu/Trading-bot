# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot with multi-broker support, AI sentiment analysis, and desktop app delivery.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Backend (Desktop):** Node.js Express (inside Electron)
- **Desktop:** Electron + electron-builder + electron-updater
- **AI:** OpenAI GPT-4o via Emergent LLM Key

## Current Version: v3.1.6

### v3.1.6 Fixes
- **CRITICAL FIX: Frontend `displayTrades` was OVERRIDING backend data** — LIVE mode mein frontend directly raw Upstox positions use kar raha tha (with `average_price: 0`) instead of backend se aaye merged data. Fixed to use backend `/api/trades/active` response which has proper `buy_price` fallback.
- **Manual Exit Button** — Each active trade pe red "Exit" button. LIVE mode: places SELL MARKET order on Upstox. PAPER mode: closes trade locally.
- **Live Positions table fixed** — Now shows proper Entry Price, P&L % from backend data instead of raw Upstox data.
- **Portfolio P&L** — Header P&L now uses actual live_pnl from active trades.
- **Footer version** updated to v3.1.6.

### Option Chain - LIVE DATA (FIXED v3.0.7)
- NSE moved ALL derivatives expiry from Thursday to TUESDAY (Aug 2025)
- Fetches ACTUAL nearest expiry from Upstox `/v2/option/contract` API
- 30-minute cache for expiry dates to reduce API calls
- Falls back to calculated next Tuesday if API fails

### Auto-Trade System (MAJOR OVERHAUL v3.0.8)
- Auto-Entry on Signal: article analyzed -> signal generated -> LIVE trade placed
- Auto-Entry for Untraded Signals: checks and executes after news analysis
- Robust Error Handling: failures saved to db
- Dynamic Strike Prices based on actual market spot price
- Correct Expiry Dates from Upstox API

### Debug System (v3.1.0)
- `GET /api/debug/auto-trade-test` - Simulates full auto-trade flow step by step
- "Debug Auto-Trade" button in UI for user testing

### 6 Trading Instruments (NSE/BSE)
- NSE: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY
- BSE: SENSEX, BANKEX

### News Sources (11 sources)
- Moneycontrol, Economic Times, NDTV Profit, CNBC TV18, Livemint
- Business Today, The Hindu Business Line, NSE India, NewsAPI, Alpha Vantage, Demo

## Bug Fix History
- v3.1.2: Fixed product 'D' -> 'I' across ALL files, lot-size calc, enhanced error logging
- v3.1.1: Fixed expiry date selection (nearest vs farthest), partial product fix in news.js
- v3.1.0: Added debug endpoint and UI button for auto-trade diagnostics
- v3.0.8: Major auto-trade overhaul, reduced dedup, execute-signal endpoint
- v3.0.7: NSE Tuesday expiry fix, fetchNearestExpiry from Upstox API
- v3.0.6: Version display, diagnostics, dynamic strike prices

## Pending
- P0: User to build v3.1.2 and test auto-trade via "Debug Auto-Trade" button first
- P0: Full end-to-end LIVE auto-trade test after debug verification

## Future/Backlog
- Stock Options trading support
- Telegram notifications integration
- Code refactoring (unify dual Node.js/Python backend)
- Enhanced analytics & tax reports
- Refactor news.js and trading.js (remove duplicated logic)
