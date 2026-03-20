# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that:
- Connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish)
- Automatically executes options (Call/Put) trades on brokers (Upstox primary)
- Desktop application for Windows/Mac with auto-updates
- Paper and Live trading modes

## Architecture (v4.1.5)
```
/app/
├── desktop/                  # Node.js/Express backend (SOLE BACKEND - port 8002)
│   ├── main.js               # Electron entry point
│   ├── web_server.js          # Standalone web server
│   ├── package.json           # v4.1.5
│   └── routes/
│       ├── lib/               # Modular logic
│       │   ├── news_fetcher.js
│       │   ├── sentiment.js
│       │   ├── signal_generator.js
│       │   ├── tax_calculator.js
│       │   └── technical_analysis.js  # SMA signal added
│       ├── news.js
│       ├── trading.js         # Fixed: /api/trades/today now includes PAPER unrealized P&L
│       ├── journal.js         # AI Trade Journal
│       ├── portfolio.js
│       ├── settings.js
│       ├── upstox.js
│       ├── broker_router.js
│       ├── extra_apis.js
│       ├── market_status.js
│       ├── tax.js
│       ├── technical.js
│       └── ai_engine.js
├── frontend/
│   └── src/
│       ├── App.js             # Fixed: Today's P&L from active trades' live_pnl + realized
│       └── components/
│           ├── RiskPanel.js    # Displays Today's P&L from riskMetrics
│           ├── TradesList.js   # Live P&L indicator
│           ├── TradeJournal.js
│           ├── AIInsights.js   # Verified working
│           ├── TechnicalAnalysis.js # Verified working
│           └── TaxReports.js
└── backend/                   # MINIMAL PROXY (Python → Node.js:8002)
    └── server.py
```

## Tech Stack
- **Frontend**: React, Tailwind CSS, Shadcn UI
- **Backend**: Node.js (Express) - SOLE backend
- **Desktop**: Electron
- **Database**: lowdb (JSON file)
- **AI**: OpenAI GPT-4o via Emergent LLM Key
- **Broker**: Upstox (active)

## What's Been Implemented
- Full news scraping from 11 sources
- AI sentiment analysis (GPT-4o)
- Automated signal generation with confidence scoring
- Paper and Live trading modes
- Auto-entry/exit engine
- Multi-broker support framework (Upstox active)
- Live Option Chain with Greeks
- Tax Reports with broker charges breakdown
- Technical Analysis (RSI, MACD, EMA, SMA with signal, VWAP)
- Market status and holiday tracking
- Sector heatmap and AI insights
- Desktop app builds (v4.1.5)
- Python backend deleted, Node.js unified backend
- AI Trade Journal (auto-review, insights, stats)
- 1-second live P&L auto-refresh on Active Trades tab
- Gradual price simulation for PAPER mode
- **FIXED: Today's P&L now shows realized + unrealized P&L correctly**
- **VERIFIED: AI Brain and Technical Analysis reading data correctly**

## Prioritized Backlog

### P1 - High Priority
- New desktop app build (v4.1.5)
- Full end-to-end user verification

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
- App.js refactoring (800+ lines - should be broken into components/hooks)
