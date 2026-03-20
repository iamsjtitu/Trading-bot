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
│       │   ├── signal_generator.js  # Emergency stop + max_per_trade + CALL/PUT + journal blocking + auto_entry check
│       │   ├── technical_analysis.js
│       │   ├── sentiment.js
│       │   ├── news_fetcher.js
│       │   └── tax_calculator.js
│       ├── news.js            # AUTO_ENTRY check before trade execution
│       ├── trading.js         # DB-direct reads for auto_exit/auto_entry (no cached vars)
│       ├── settings.js        # POST /api/emergency-stop endpoint
│       ├── journal.js
│       ├── portfolio.js
│       ├── upstox.js
│       ├── broker_router.js
│       ├── extra_apis.js
│       ├── market_status.js
│       ├── tax.js
│       ├── technical.js
│       └── ai_engine.js
├── frontend/
│   └── src/
│       ├── App.js
│       └── components/
│           ├── AutoTradingSettings.js  # Updated descriptions
│           ├── RiskPanel.js
│           ├── TradesList.js
│           ├── TradeJournal.js
│           ├── AIInsights.js
│           ├── TechnicalAnalysis.js
│           └── TaxReports.js
└── backend/                   # MINIMAL PROXY (Python → Node.js:8002)
    └── server.py
```

## What's Been Implemented

### v4.2.0 (Current - Critical Safety & Trading Fixes)
**Safety Fixes:**
- Emergency Stop persists to backend, blocks ALL trades
- Max per trade strictly enforced (gets LTP, calculates qty within budget)
- **Auto-entry OFF now PROPERLY blocks all trade execution** (was the root cause of trades executing despite OFF)
- Auto-exit reads from DB directly (not cached variables)

**Trading Logic Fixes:**
- Proper CALL/PUT: BUY_CALL→CALL, BUY_PUT→PUT, HOLD→skip
- AI Journal blocks consistently losing sector+type combos
- Entry price always syncs from Upstox's average_price
- SMA indicator includes signal and reason

**Code Changes:**
- `news.js`: Added `auto_entry` check before trade execution (line 54-57)
- `trading.js`: Replaced cached `autoExitEnabled`/`autoEntryEnabled` with DB reads
- `signal_generator.js`: Emergency stop check, proper CALL/PUT mapping, journal blocking, max_per_trade with LTP
- `settings.js`: New POST /api/emergency-stop endpoint
- `AutoTradingSettings.js`: Clearer descriptions

### v4.1.5
- Today's P&L shows unrealized P&L in PAPER mode
- AI Brain and Technical Analysis verified working

### Earlier
- Full news scraping (11 sources), AI sentiment (GPT-4o)
- Paper/Live trading, Multi-broker framework
- Live Option Chain, Tax Reports, Technical Analysis
- AI Trade Journal, 1-second live P&L refresh

## Key API Endpoints
- `POST /api/emergency-stop` - Activate/deactivate emergency stop
- `POST /api/auto-settings/update` - Toggle auto_entry/auto_exit
- `GET /api/news/fetch` - Fetch + analyze news (respects auto_entry)
- `POST /api/auto-exit/check` - Check SL/Target exits (respects auto_exit)
- `GET /api/trades/active` - Active trades with live P&L
- `GET /api/trades/today` - Today's realized + unrealized P&L

## Prioritized Backlog

### P1 - High Priority
- New desktop app build (v4.2.0)
- Full end-to-end user verification with live broker

### P2 - Medium Priority
- Increase active trade limit (currently 1 CALL + 1 PUT per instrument)
- Stock Options trading support
- Telegram notifications
- Strategy Backtesting
- Dark Mode theme

### P3 - Future
- Multi-strategy support, Mobile app, Social trading
- Export Journal to PDF
- App.js refactoring (800+ lines)
