# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses GPT-4o for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Standalone desktop application for Windows/Mac with auto-updates.

## Architecture (v4.7.0)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: Node.js/Express (port 8002, proxied through Python FastAPI on 8001)
- **Desktop**: Electron | **AI**: GPT-4o via Emergent LLM Key
- **Broker**: Upstox API v2 (LIVE mode) | **Database**: Local JSON (lowdb)

## v4.7.0 - AI Loss Prevention Suite (Verified)

### 6 AI Guards (All verified with live data, iteration_32):
1. **Multi-Timeframe Confirmation** - 2+ timeframes agree before trading (daily fallback when market closed)
2. **Market Regime Filter** - Auto-pause in SIDEWAYS/CHOPPY markets
3. **Trailing Stop Loss** - SL moves up as price rises (math fix verified: entry=100, peak=120 → SL=110)
4. **Multi-Source News Verification** - 2+ different news sources must agree within 15 min
5. **Time-of-Day Filter** - Blocks 9:15-9:45 & 3:00-3:30 IST volatile windows
6. **Max Daily Loss Auto-Stop** - Pauses ALL trading when loss exceeds ₹5000 (Always ON, currently BLOCKING at ₹5,634 loss)

### Bug Fixes in v4.7.0:
- Trailing SL math (parentheses fix)
- Multi-TF check in re-entry path
- Intraday-to-daily fallback when market closed
- Technical Analysis always uses Upstox (not demo)

### v4.5.0-4.6.0 Earlier Changes:
- Tax Report (Upstox pagination, charges mapping, 3-view UI)
- Risk Ratio Guard + Alert UI (Red/Yellow/Green)
- min_confidence=70% enforced
- Shared AI Engine, max open trades fix

## Current Settings
- SL: 15% | Target: 25% (1.7:1 ratio) | Min Confidence: 70%
- Max Daily Loss: ₹5,000 | Max Open Trades: 5 | Auto-Entry: OFF

## Backlog
### P1: Desktop build v4.7.0
### P2: Stock Options, Telegram, Backtesting, Dark Mode, PDF Export, App.js refactor
### P3: Multi-broker (Zerodha, Angel One, 5paisa)
