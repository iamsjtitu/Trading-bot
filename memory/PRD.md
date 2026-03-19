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
│       ├── trading.js
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
├── frontend/                  # React + Tailwind + Shadcn
│   └── src/components/
│       └── TradeJournal.js    # AI Journal UI
└── backend/                   # MINIMAL PROXY (103 lines)
    ├── .env                   # Environment variables
    ├── requirements.txt       # fastapi, httpx only
    └── server.py              # Proxy → Node.js:8002
```

## Tech Stack
- **Frontend**: React, Tailwind CSS, Shadcn UI
- **Backend**: Node.js (Express) - SOLE backend, 13 route files, 5 lib modules
- **Desktop**: Electron
- **Database**: lowdb (JSON file)
- **AI**: OpenAI GPT-4o via Emergent LLM Key
- **Broker**: Upstox (active)

## Version History
- v4.1.0: Python backend deleted, unified Node.js backend, AI Trade Journal
- v4.0.1: Tax reports with broker charges, Technical Analysis, code refactoring
- v4.0.0: Multi-broker framework, Option Chain, Desktop builds

## Prioritized Backlog

### P1 - High Priority
- New desktop app build (v4.1.0)
- Full end-to-end user verification with live trades

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
