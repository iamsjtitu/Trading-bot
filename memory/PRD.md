# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses GPT-4o for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Standalone desktop application for Windows/Mac with auto-updates.

## Architecture (v4.5.0)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: Node.js/Express (port 8002, proxied through Python FastAPI on 8001)
- **Desktop**: Electron
- **AI**: GPT-4o via Emergent LLM Key
- **Broker**: Upstox API v2 (LIVE mode)
- **Database**: Local JSON (lowdb)

## What's Implemented

### v4.5.0 (Current - Critical Bug Fixes)

#### Tax Report Fix
- Fixed variable ordering crash bug (todayPositions used before defined)
- Added `from_date`/`to_date` to Upstox P&L API for full FY coverage
- Fixed FY format parsing (accepts "2025-26", "25-26", "2526")
- Fixed Upstox charges mapping (nested `charges_breakdown.taxes.stt/gst/stamp_duty`)
- Frontend: 3-view layout (Summary, Monthly breakdown, Trade details)

#### Technical Analysis Fix (CRITICAL - was causing demo signals)
- Fixed Upstox API interval names: `day` not `1day`, intraday only `1minute`/`30minute`
- Added proper intraday vs historical endpoint routing
- Added candle aggregation for 5min/15min from 1-minute data
- **Before**: Source was "demo" (random data) → bad signals → losses
- **After**: Source is "upstox" with real market candles

#### Risk Ratio Guard (CRITICAL - inverted SL/Target)
- Added guard: if `target_pct < stop_loss_pct`, enforce target = stoploss (minimum 1:1)
- Applied in signal generation AND auto-exit check
- **Before**: SL=30%, Target=15% → lose ₹2 for every ₹1 gained
- **After**: Enforced minimum 1:1 ratio

#### Shared AI Engine
- news.js and trading.js now share one AIDecisionEngine instance via `db._sharedAIEngine`
- **Before**: Separate instances → trading module had no sentiment context from news
- **After**: Shared state → market regime, sector momentum, signal correlation all unified

#### Live Trade Execution Fix
- `executeLiveTrade()` now uses signal's pre-calculated SL/target values
- **Before**: Recalculated from scratch with wrong defaults
- **After**: Uses signal's already-computed values (consistent with generateSignal)

#### Max Open Trades Fix
- Removed per-type duplicate blocking that prevented max_open_trades=5
- Now uses count check: `openInInstrument.length >= maxTotalTrades`
- Applies in both signal_generator.js and news.js auto-entry

### v4.4.0
- GPT-4.1-mini references removed, fixed to GPT-4o
- LIVE P&L reads ALL Upstox positions
- 5 trades per instrument (configurable)

### v4.3.x
- Trade limit increase, auto-entry OFF respected, AI Engine fixes

## Current Settings
- **Mode**: LIVE
- **Instrument**: BANKNIFTY
- **Auto-Exit**: ON
- **Auto-Entry**: OFF
- **Max Open Trades**: 5
- **SL**: 30% (user setting - NEEDS REVIEW)
- **Target**: 15% (user setting - guarded to 30% by code)

## Known Limitations
- Upstox access tokens expire daily - user needs to reconnect
- Tax report accuracy depends on Upstox API data availability (T+1 settlement)
- App.js is monolithic (800+ lines)
- User's risk settings have poor ratio (SL 30% / Target 15%) - code guards to 1:1 but user should fix to 2:1

## Backlog
### P0 (Critical)
- None currently

### P1 (High Priority)
- Desktop build v4.5.0
- Risk Settings review with user (suggest Target=20%, SL=10% for 2:1 ratio)

### P2 (Medium Priority)
- Stock Options trading support
- Telegram notifications
- Strategy Backtesting
- Dark Mode theme
- Export Journal to PDF
- App.js refactoring (800+ lines → separate components)

### P3 (Low Priority)
- Multi-broker support (Zerodha, Angel One, 5paisa)
