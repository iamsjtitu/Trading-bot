# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot with multi-broker support, AI sentiment analysis, and desktop app delivery.

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Web):** Python FastAPI + MongoDB
- **Backend (Desktop):** Node.js Express (inside Electron)
- **Desktop:** Electron + electron-builder + electron-updater
- **AI:** OpenAI GPT-4o via Emergent LLM Key

## Current Version: v3.0.8

### Option Chain - LIVE DATA (FIXED)
- NSE moved ALL derivatives expiry from Thursday to TUESDAY (Aug 2025)
- Now fetches ACTUAL nearest expiry from Upstox `/v2/option/contract` API
- 30-minute cache for expiry dates to reduce API calls
- Falls back to calculated next Tuesday if API fails
- Parses Upstox data into frontend format with full Greeks

### Auto-Trade System (MAJOR OVERHAUL v3.0.8)
- **Auto-Entry on Signal**: When new article analyzed → signal generated → LIVE trade placed automatically
- **Auto-Entry for Untraded Signals**: After news analysis, checks for untraded ACTIVE signals and executes them
- **Robust Error Handling**: Trade failures saved to db with error message, won't crash analysis loop
- **Reduced Deduplication**: Articles only deduped against last 1 hour (was: last 100 articles forever)
- **Dynamic Strike Prices**: Based on actual market spot price, not hardcoded 24000
- **Correct Expiry Dates**: Fetches from Upstox API, falls back to Tuesday
- **New Endpoints**:
  - `POST /api/trades/execute-signal` - Execute trade from existing signal
  - `GET /api/trades/log` - View ALL trades including FAILED (for debugging)
  - `GET /api/version` - Check app version
  - `GET /api/diagnostics` - Full diagnostic info

### 6 Trading Instruments (NSE/BSE, MCX removed)
- NSE: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY (ALL expire Tuesday)
- BSE: SENSEX, BANKEX (expire Tuesday)

### News Sources (11 sources)
- Moneycontrol, Economic Times, NDTV Profit, CNBC TV18, Livemint
- Business Today, The Hindu Business Line, Reuters, Bloomberg + RSS

## Bug Fix History
- v3.0.8: Major auto-trade overhaul, reduced dedup, execute-signal endpoint, trade log
- v3.0.7: NSE Tuesday expiry fix, fetchNearestExpiry from Upstox API
- v3.0.6: Version display, diagnostics, dynamic strike prices
- v3.0.5: Added required expiry_date parameter to Upstox API calls
- v3.0.4: parseLiveChain(), error handling, MCX cleanup

## Pending
- P0: User to build v3.0.8 and test auto-trade end-to-end
- P1: Verify option chain data loads in market hours

## Future/Backlog
- Stock Options trading support
- Telegram notifications
- Code refactoring
- Enhanced analytics & tax reports
