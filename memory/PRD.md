# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses GPT-4o for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Standalone desktop application for Windows/Mac with auto-updates.

## Architecture (v5.1.0)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: Node.js/Express (port 8002, proxied through Python FastAPI on 8001)
- **Desktop**: Electron | **AI**: GPT-4o via Emergent LLM Key
- **Broker**: Upstox API v2 (LIVE mode) | **Database**: Local JSON (lowdb)
- **Notifications**: Telegram Bot (@T2_kridha_bot)

## v5.1.0 Features (All Verified)

### New in this session:
1. **AI Exit Advisor** - Checks open trades every 3 min during market hours. GPT-4o analyzes market conditions, news, price action. Provides HOLD/EXIT_NOW/PARTIAL_EXIT/TIGHTEN_SL recommendations. Manual "Ask AI" button on each trade. Shows advice card below trade with confidence, risk level, reason.
2. **Telegram Alerts** - 6 alert types: New signals, Trade entry/exit, Daily P&L summary, Guard blocks, Exit Advisor recommendations. Bot: @T2_kridha_bot, Chat ID: 5861330845.
3. **News Fetcher v2** - Parallel fetching from 8 sources with round-robin fair distribution. Fixed Business Today redirect, added proper User-Agent headers.
4. **Background Market Data Fetcher** - Auto-caches live spot prices every 60s during market hours.
5. **Collapsible AI Guards Panel** - Show/Hide dropdown.

### v4.8.0 (Deep Verified):
- Smart Position Sizing (Kelly Criterion) - 3 modes, mode-filtered stats
- Options Greeks & IV Filter - Smart IV estimation, volatility smile
- Kelly works in LIVE trades (bug fixed)

### v4.7.0 (Verified):
- 8 AI Loss Prevention Guards with ON/OFF toggles
- min_confidence bug fix
- Risk Ratio Alert

## API Endpoints (13 routes)
- `/api/health`, `/api/debug`, `/api/settings/*`
- `/api/news/*`, `/api/ai-guards/*`, `/api/position-sizing/*`
- `/api/options/*` (greeks, chain, IV)
- `/api/exit-advisor/*` (status, advice, analyze)
- `/api/telegram/*` (status, setup, discover, test, alerts)
- `/api/market-data/bg-status`
- `/api/trading/*`, `/api/portfolio/*`

## Backlog
### P1: App.js refactor (800+ lines)
### P2: Multi-broker (Zerodha, Angel One, 5paisa) - when API keys ready
