# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses GPT-4o for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Standalone desktop application for Windows/Mac with auto-updates.

## Architecture (v4.8.0)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: Node.js/Express (port 8002, proxied through Python FastAPI on 8001)
- **Desktop**: Electron | **AI**: GPT-4o via Emergent LLM Key
- **Broker**: Upstox API v2 (LIVE mode) | **Database**: Local JSON (lowdb)

## v4.8.0 - Options Greeks & Kelly Criterion (Verified, iteration_33)

### New Features:
1. **Smart Position Sizing (Kelly Criterion)** - AI decides trade size based on win rate, streak, drawdown. Losing streak auto-reduces size. 3 modes: Conservative (25%), Balanced (50%), Aggressive (75%).
2. **Options Greeks & IV Filter** - Black-Scholes Delta, Gamma, Theta, Vega calculations. Blocks bad options (score <25). Warns on mediocre options (score <40). IV analysis with rank & percentile.

### New API Endpoints:
- `GET /api/position-sizing` - Kelly Criterion analysis with capital curve
- `POST /api/position-sizing/mode` - Change sizing mode
- `GET /api/options/greeks` - Calculate Greeks for specific option
- `GET /api/options/chain-greeks` - Greeks for full option chain around ATM
- `GET /api/options/iv-analysis` - IV analysis for positions

## v4.7.0 - AI Loss Prevention Suite (Verified)

### 8 AI Guards (All verified):
1. **Multi-Timeframe Confirmation** - 2+ timeframes agree before trading
2. **Market Regime Filter** - Auto-pause in SIDEWAYS/CHOPPY markets
3. **Trailing Stop Loss** - SL moves up as price rises
4. **Multi-Source News Verification** - 2+ news sources must agree
5. **Time-of-Day Filter** - Blocks volatile open/close windows
6. **Max Daily Loss Auto-Stop** - Always ON, pauses at loss limit
7. **Smart Position Sizing (Kelly)** - Toggle ON/OFF
8. **Options Greeks & IV Filter** - Toggle ON/OFF

## Current Settings
- SL: 15% | Target: 25% (1.7:1 ratio) | Min Confidence: 70%
- Max Daily Loss: 5,000 | Max Open Trades: 5 | Auto-Entry: OFF
- Kelly Mode: Conservative | Greeks Filter: ON

## Backlog
### P1: Desktop build v4.8.0
### P2: Stock Options, Telegram, Backtesting, Dark Mode, PDF Export, App.js refactor
### P3: Multi-broker (Zerodha, Angel One, 5paisa)
