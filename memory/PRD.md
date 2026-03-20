# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses GPT-4o for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Standalone desktop application for Windows/Mac with auto-updates.

## Architecture (v4.5.0)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: Node.js/Express (port 8002, proxied through Python FastAPI on 8001)
- **Desktop**: Electron
- **AI**: GPT-4o via Emergent LLM Key (sk-emergent-754...)
- **Broker**: Upstox API v2 (LIVE mode, connected to SUMIT KUMAR JAIN)
- **Database**: Local JSON (lowdb)

## What's Implemented

### v4.5.0 (Current - Critical Bug Fixes + Risk Alert)

#### Tax Report Fix
- Fixed variable ordering crash, FY format parsing, charges mapping
- Frontend: 3-view layout (Summary, Monthly, Trade details)

#### Technical Analysis Fix (was causing demo signals)
- Fixed Upstox API interval mapping (day not 1day, 1minute+aggregation not 5minute)
- Intraday vs historical endpoint routing

#### Risk Ratio Guard + Alert UI
- Backend guard: if target_pct < stop_loss_pct, enforce 1:1 minimum
- Frontend Risk Ratio Alert: Red (bad), Yellow (1:1), Green (good)
- "Apply Safe 2:1 Ratio" one-click fix button
- SL/Target sync between risk settings and auto-trading settings on save

#### Shared AI Engine
- news.js and trading.js share one AIDecisionEngine via db._sharedAIEngine

#### Live Trade Execution Fix
- Uses signal's pre-calculated SL/target instead of recalculating

#### Max Open Trades Fix
- Count-based check instead of per-type duplicate blocking

### v4.4.0
- GPT-4o model, LIVE P&L, 5 trades per instrument

### v4.3.x
- Trade limit increase, auto-entry OFF respected, AI Engine fixes

## Current Settings
- **Mode**: LIVE | **Instrument**: BANKNIFTY
- **Auto-Exit**: ON | **Auto-Entry**: OFF
- **Max Open Trades**: 5
- **SL**: 15% | **Target**: 25% (1.7:1 ratio)
- **Portfolio**: ₹2,03,845 | **Today P&L**: -₹951

## Backlog
### P1 (High)
- Desktop build v4.5.0
### P2 (Medium)
- Stock Options, Telegram, Backtesting, Dark Mode, PDF Export, App.js refactor
### P3 (Low)
- Multi-broker (Zerodha, Angel One, 5paisa)
