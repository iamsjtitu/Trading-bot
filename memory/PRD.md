# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that:
- Connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish)
- Automatically executes options (Call/Put) trades on brokers (Upstox primary)
- Desktop application for Windows/Mac with auto-updates
- Paper and Live trading modes

## Architecture (v4.1.0)
```
/app/
├── desktop/                  # Node.js/Express backend (SOLE BACKEND)
│   ├── main.js               # Electron entry point
│   ├── web_server.js          # Standalone web server
│   ├── package.json           # v4.1.0
│   └── routes/
│       ├── lib/               # Modular logic
│       │   ├── news_fetcher.js
│       │   ├── sentiment.js
│       │   ├── signal_generator.js
│       │   ├── tax_calculator.js
│       │   └── technical_analysis.js
│       ├── news.js
│       ├── trading.js         # Gradual price simulation + journal hook
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
│       ├── App.js             # Active tab tracking + 1s trade refresh
│       └── components/
│           ├── TradesList.js   # Live P&L indicator + smooth transitions
│           ├── TradeJournal.js
│           ├── TaxReports.js
│           └── TechnicalAnalysis.js
└── backend/                   # MINIMAL PROXY (103 lines)
    └── server.py              # Proxy → Node.js:8002
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
- Technical Analysis (RSI, MACD, EMA, SMA, VWAP)
- Market status and holiday tracking
- Sector heatmap and AI insights
- Desktop app builds (v4.1.0)
- Python backend deleted, Node.js unified backend
- AI Trade Journal (auto-review, insights, stats)
- **1-second live P&L auto-refresh** on Active Trades tab
- Gradual price simulation for PAPER mode
- Live refresh indicator with pulse animation

## Prioritized Backlog

### P1 - High Priority
- New desktop app build (v4.1.0)
- Full end-to-end user verification

### P2 - Medium Priority
- Stock Options trading support
- Telegram notifications integration
- Strategy Backtesting
- Dark Mode theme

### P3 - Future
- Multi-strategy support
- Mobile app
- Social trading features
- Export Journal to PDF
