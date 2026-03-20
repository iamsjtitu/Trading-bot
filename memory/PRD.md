# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that:
- Connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish)
- Automatically executes options (Call/Put) trades on brokers (Upstox primary)
- Desktop application for Windows/Mac with auto-updates
- Paper and Live trading modes

## Architecture (v4.2.0)
```
/app/
├── desktop/                  # Node.js/Express backend (SOLE BACKEND - port 8002)
│   ├── main.js               # Electron entry point
│   ├── web_server.js          # Standalone web server
│   ├── package.json           # v4.2.0
│   └── routes/
│       ├── lib/
│       │   ├── news_fetcher.js
│       │   ├── sentiment.js
│       │   ├── signal_generator.js  # Emergency stop + max_per_trade + proper CALL/PUT + journal blocking
│       │   ├── tax_calculator.js
│       │   └── technical_analysis.js
│       ├── news.js            # Emergency stop check before trade execution
│       ├── trading.js         # Emergency stop in auto-exit re-entry, Upstox price sync
│       ├── journal.js
│       ├── portfolio.js
│       ├── settings.js        # New: POST /api/emergency-stop endpoint
│       ├── upstox.js
│       ├── broker_router.js
│       ├── extra_apis.js
│       ├── market_status.js
│       ├── tax.js
│       ├── technical.js
│       └── ai_engine.js
├── frontend/
│   └── src/
│       ├── App.js             # Emergency stop persists to backend, today's P&L from live trades
│       └── components/
│           ├── RiskPanel.js
│           ├── TradesList.js
│           ├── TradeJournal.js
│           ├── AIInsights.js
│           ├── TechnicalAnalysis.js
│           └── TaxReports.js
└── backend/                   # MINIMAL PROXY (Python → Node.js:8002)
    └── server.py
```

## What's Been Implemented (v4.2.0 - Critical Safety Fixes)

### v4.2.0 (Current - Safety & Trading Logic Fixes)
- **Emergency Stop now persists to backend** - Blocks ALL trades across signals, news, auto-entry, auto-exit re-entry
- **Max per trade strictly enforced** - Gets actual option LTP before order, calculates qty within budget, blocks if 1 lot exceeds limit
- **Proper CALL/PUT decision** - BUY_CALL→CALL, BUY_PUT→PUT, HOLD/unknown→skip (no more everything-becomes-PUT bug)
- **AI Journal influences decisions** - Blocks trades for sector+sentiment combos with >=5 trades and <=20% win rate
- **P&L sync from Upstox** - Active trades always sync entry_price from broker's average_price (fixes investment mismatch)
- **Entry price sync improved** - Syncs from Upstox whenever diff > ₹1 (not just when price is 0 or 150)
- **SMA indicator** now includes signal and reason in Technical Analysis

### v4.1.5 (Previous)
- Fixed Today's P&L to show unrealized P&L in PAPER mode
- Verified AI Brain and Technical Analysis features

### Earlier Versions
- Full news scraping from 11 sources
- AI sentiment analysis (GPT-4o)
- Automated signal generation with confidence scoring
- Paper and Live trading modes
- Multi-broker support framework (Upstox active)
- Live Option Chain, Tax Reports
- Technical Analysis (RSI, MACD, EMA, SMA, VWAP)
- AI Trade Journal
- 1-second live P&L auto-refresh

## Prioritized Backlog

### P1 - High Priority
- New desktop app build (v4.2.0)
- Full end-to-end user verification with live broker

### P2 - Medium Priority
- Increase active trade limit (currently 1 CALL + 1 PUT per instrument)
- Stock Options trading support
- Telegram notifications integration
- Strategy Backtesting
- Dark Mode theme

### P3 - Future
- Multi-strategy support
- Mobile app
- Social trading features
- Export Journal to PDF
- App.js refactoring (800+ lines)
