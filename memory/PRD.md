# AI Trading Bot - Product Requirements Document

## Problem Statement
Fully local AI-powered automated options trading bot desktop application with Upstox broker integration, AI sentiment analysis, and auto-update via GitHub Releases.

## Architecture
```
desktop/                        # Electron Desktop App
├── main.js                     # Spawns backend, creates window, tray, auto-updater
├── preload.js                  # IPC bridge
├── package.json                # electron-builder config (Win NSIS + Mac DMG)
├── assets/icon.png             # App icon
├── scripts/
│   ├── setup-windows.bat       # One-click Windows setup
│   └── setup-mac.sh            # One-click Mac setup
└── .github/workflows/build.yml # CI/CD auto-build on tag push

backend/                        # FastAPI Backend (runs locally)
├── server.py                   # API routes (supports MongoDB + LocalDB)
├── local_db.py                 # File-based JSON DB (no MongoDB needed!)
├── upstox_service.py           # Upstox OAuth, market data, orders
├── news_service.py             # NewsAPI / Alpha Vantage / Demo
├── sentiment_service.py        # AI sentiment (GPT-4.1-mini)
├── trading_engine.py           # Paper/live trading
├── settings_manager.py         # Settings CRUD
└── .env.template               # Config template

frontend/                       # React PWA (bundled in Electron)
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
- [x] AI Sentiment Analysis
- [x] Paper + Live trading modes
- [x] GitHub Actions CI/CD
- [x] One-click setup scripts

## Backlog
### P0 - Wire AI signals → Upstox auto order execution
### P1 - Trade analytics with P&L charts, CSV export
### P2 - Telegram/Email notifications
