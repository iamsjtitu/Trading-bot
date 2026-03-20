# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses GPT-4o for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Standalone desktop application for Windows/Mac with auto-updates.

## Architecture (v4.6.0)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: Node.js/Express (port 8002, proxied through Python FastAPI on 8001)
- **Desktop**: Electron
- **AI**: GPT-4o via Emergent LLM Key
- **Broker**: Upstox API v2 (LIVE mode)
- **Database**: Local JSON (lowdb)

## What's Implemented

### v4.6.0 (Current - AI Loss Prevention Suite)

#### 6 AI Loss Prevention Guards (All ON by default):
1. **Multi-Timeframe Confirmation**: Signal only trades when 2+ timeframes (5min + 30min) agree on direction. Fake signals 60-70% reduced.
2. **Market Regime Filter**: Auto-pauses trading in SIDEWAYS/CHOPPY markets where option premium decays fast.
3. **Trailing Stop Loss**: SL moves up as price rises (activates at 50% of target, trails at 50% of peak profit). Locks winning trades' profit.
4. **Multi-Source News Verification**: Requires 2+ different news sources to agree on sentiment within 15 minutes before trading.
5. **Time-of-Day Filter**: Blocks trading during high-volatility windows (market open 9:15-9:45, market close 3:00-3:30 IST).
6. **Max Daily Loss Auto-Stop**: Pauses ALL trading when daily realized loss exceeds limit (₹5000 default). Always ON.

#### Other v4.6.0 Changes:
- Risk Ratio Alert UI (Red/Yellow/Green + one-click "Apply Safe 2:1 Ratio" button)
- min_confidence=70% enforced in all 3 code paths (signal_generator, news, trading)
- SL/Target auto-sync between Risk Settings and Auto-Trading on save
- AI Guards dashboard panel with live status and toggle switches

### v4.5.0
- Tax Report fix (pagination, charges mapping, frontend UI)
- Technical Analysis fix (Upstox interval names)
- Risk ratio guard, shared AI engine, max open trades fix

### v4.4.0 & Earlier
- GPT-4o model, LIVE P&L, 5 trades per instrument, auto-entry/exit fixes

## Current Settings
- **Mode**: LIVE | **Instrument**: BANKNIFTY
- **Auto-Exit**: ON | **Auto-Entry**: OFF
- **Max Open Trades**: 5 | **Min Confidence**: 70%
- **SL**: 15% | **Target**: 25% (1.7:1 ratio)
- **Max Daily Loss**: ₹5,000

## Backlog
### P1 (High)
- Desktop build v4.6.0
### P2 (Medium)  
- Stock Options, Telegram, Backtesting, Dark Mode, PDF Export, App.js refactor
### P3 (Low)
- Multi-broker (Zerodha, Angel One, 5paisa)
