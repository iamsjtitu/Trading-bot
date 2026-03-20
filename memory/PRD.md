# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses GPT-4o for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Standalone desktop application for Windows/Mac with auto-updates.

## Architecture (v4.8.0)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: Node.js/Express (port 8002, proxied through Python FastAPI on 8001)
- **Desktop**: Electron | **AI**: GPT-4o via Emergent LLM Key
- **Broker**: Upstox API v2 (LIVE mode) | **Database**: Local JSON (lowdb)

## v4.8.0 - Options Greeks & Kelly Criterion (Deep Verified, iteration_34)

### New Features:
1. **Smart Position Sizing (Kelly Criterion)** - AI decides trade size based on win rate, streak, drawdown. Losing streak auto-reduces size. 3 modes: Conservative (25%), Balanced (50%), Aggressive (75%).
2. **Options Greeks & IV Filter** - Black-Scholes Delta, Gamma, Theta, Vega calculations. Blocks bad options (score <25). Warns on mediocre (score <40). IV analysis with rank & percentile.

### Critical Bug Fixes in v4.8.0:
1. **Kelly Criterion in LIVE trades** - Was completely ignored in executeLiveTrade. Now uses kelly_sizing.suggested_amount to cap maxTrade budget.
2. **Kelly mode filtering** - Was using mixed PAPER+LIVE trade stats. Now filters by current trading mode.
3. **Smart IV estimation** - Was hardcoded at 15%. Now uses instrument-specific defaults (Nifty=14%, BankNifty=18%) + OTM volatility smile + historical signal IVs.
4. **Spot price fallback warnings** - Logs warnings when using stale/fallback spot prices for Greeks calculations.

### New API Endpoints:
- `GET /api/position-sizing` - Kelly analysis with `trading_mode` field
- `POST /api/position-sizing/mode` - Change sizing mode
- `GET /api/options/greeks` - Greeks for specific option
- `GET /api/options/chain-greeks` - Chain greeks around ATM
- `GET /api/options/iv-analysis` - IV analysis for positions

## v4.7.0 - AI Loss Prevention Suite (Verified)

### 8 AI Guards (All verified, deep conflict check passed):
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
- Max Daily Loss: ₹5,000 | Max Open Trades: 5 | Auto-Entry: OFF
- Kelly Mode: Balanced | Greeks Filter: ON

## Backlog
### P1: Desktop build v4.8.0
### P2: Stock Options, Telegram, Backtesting, Dark Mode, PDF Export, App.js refactor
### P3: Multi-broker (Zerodha, Angel One, 5paisa)
