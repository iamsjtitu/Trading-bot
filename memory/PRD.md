# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses GPT-4o for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Standalone desktop application for Windows/Mac with auto-updates.

## Architecture (v5.1.0)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: Node.js/Express (port 8002, proxied through Python FastAPI on 8001)
- **Desktop**: Electron | **AI**: GPT-4o via Emergent LLM Key
- **Broker**: Upstox API v2 (LIVE mode) | **Database**: Local JSON (lowdb)
- **Notifications**: Telegram Bot (@T2_kridha_bot, Chat ID: 5861330845)

## v5.1.0 Features (Deep Verified, iteration_38)

### Core AI Features:
1. **AI Sentiment Analysis** - GPT-4o analyzes news from 8 sources
2. **AI Exit Advisor** - Checks open trades every 3 min. GPT-4o recommends HOLD/EXIT_NOW/PARTIAL_EXIT/TIGHTEN_SL. Syncs LIVE prices from Upstox before analyzing. Manual "Ask AI" button on each trade.
3. **Smart Position Sizing (Kelly Criterion)** - Dynamic trade sizing, 3 modes, mode-filtered stats, works in LIVE trades
4. **Options Greeks & IV Filter** - Black-Scholes analysis, smart IV estimation, blocks bad options

### 8 AI Loss Prevention Guards:
1. Multi-Timeframe Confirmation
2. Market Regime Filter (sends Telegram alert on block)
3. Trailing Stop Loss
4. Multi-Source News Verification
5. Time-of-Day Filter (sends Telegram alert on block)
6. Max Daily Loss Auto-Stop (Always ON, sends Telegram alert)
7. Smart Position Sizing - Kelly (Toggle)
8. Options Greeks & IV Filter (Toggle, sends Telegram alert on block)

### Telegram Alerts (6 types, individually toggleable):
- New Signals, Trade Entry, Trade Exit, Daily P&L Summary, Guard Blocks, Exit Advisor
- Auto-Connect with chat ID discovery
- Test Message and Send Daily Summary buttons

### Infrastructure:
- Background Market Data Fetcher (60s interval during market hours)
- Parallel news fetching from 8 sources with fair distribution
- 13 API routes

## Bug Fixes in Deep Verification:
1. Exit Advisor syncs LIVE trade prices from Upstox before analyzing
2. Telegram exit alerts wired in auto-exit + manual exit (paper + LIVE)
3. Guard block Telegram alerts wired (Market Regime, Max Daily Loss, Greeks)
4. Daily summary endpoint created

## Backlog
### P1: App.js refactor (800+ lines)
### P2: Multi-broker (Zerodha, Angel One, 5paisa) - when API keys ready
