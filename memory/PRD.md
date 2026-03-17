# AI Trading Bot - Product Requirements Document

## Problem Statement
Fully local AI-powered automated options trading bot desktop application with Upstox broker integration, AI sentiment analysis, and auto-update via GitHub Releases. Must be a standalone .exe (Windows) / .dmg (Mac) without requiring Python or any external runtime.

## Architecture
```
desktop/                        # Electron Desktop App (SELF-CONTAINED)
├── main.js                     # Express server + Electron shell + JsonDatabase + auto-updater
├── preload.js                  # IPC bridge
├── package.json                # electron-builder config (Win NSIS + Mac DMG)
├── assets/icon.png             # App icon
├── routes/                     # Node.js API routes (COMPLETE)
│   ├── settings.js             # Settings CRUD, trading schedule
│   ├── portfolio.js            # Portfolio summary, stats, combined-status
│   ├── news.js                 # News fetch (NewsAPI/AlphaVantage/Demo) + AI sentiment
│   ├── trading.js              # Signals, trades, auto-exit/entry, trade generation
│   └── upstox.js               # Upstox OAuth, market data, orders, P&L
└── test_api.js                 # Backend test suite

backend/                        # FastAPI Backend (WEB version - reference only)
├── server.py, local_db.py, news_service.py, sentiment_service.py
├── trading_engine.py, settings_manager.py, upstox_service.py

frontend/                       # React PWA (bundled in Electron via extraResources)
└── src/components/             # 9 modular components
```

## Key Features
- [x] Fully local - no web server needed, no MongoDB install
- [x] Local file-based DB (JSON) - data in AppData
- [x] Electron desktop app (Windows .exe + Mac .dmg)
- [x] Auto-update via GitHub Releases
- [x] System tray (runs in background)
- [x] Splash screen on startup
- [x] Upstox OAuth integration
- [x] AI Sentiment Analysis (Emergent LLM Key → OpenAI GPT-4.1-mini)
- [x] Paper + Live trading modes
- [x] **Node.js backend routes complete** (5 modules, 21+ endpoints)
- [x] Demo news mode for paper trading without API keys
- [x] Full trading pipeline: news → sentiment → signal → trade → auto-exit

## API Endpoints (Node.js Desktop Backend)
### Settings (3 endpoints)
- GET /api/settings
- POST /api/settings/update
- GET /api/settings/trading-status

### Portfolio (4 endpoints)
- POST /api/initialize
- GET /api/portfolio
- GET /api/stats
- GET /api/combined-status

### News (2 endpoints)
- GET /api/news/fetch
- GET /api/news/latest

### Trading (8 endpoints)
- GET /api/signals/latest
- GET /api/signals/active
- GET /api/trades/active
- GET /api/trades/today
- GET /api/trades/history
- POST /api/auto-exit/check
- POST /api/auto-settings/update
- GET /api/auto-settings
- POST /api/test/generate-trade

### Upstox (8 endpoints)
- GET /api/upstox/auth-url
- POST /api/upstox/callback
- GET /api/upstox/connection
- GET /api/upstox/profile
- GET /api/upstox/market-data
- GET /api/upstox/portfolio
- POST /api/upstox/order
- DELETE /api/upstox/order/:orderId
- GET /api/upstox/orders
- GET /api/upstox/pnl

## Backlog
### P0 - Build & distribute .exe/.dmg (frontend build → electron-builder)
### P1 - Wire AI signals → Upstox auto order execution
### P1 - Trade analytics with P&L charts, CSV export
### P2 - Telegram/Email notifications
### P2 - Additional broker support
