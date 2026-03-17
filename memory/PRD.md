# AI Trading Bot - Product Requirements Document

## Problem Statement
AI-powered automated options trading bot with Upstox broker, AI sentiment analysis, live market data, and desktop app support.

## Architecture
```
/app/
├── backend/                    # FastAPI Backend
│   ├── server.py               # API routes
│   ├── upstox_service.py       # Upstox OAuth, market data, orders
│   ├── news_service.py         # NewsAPI / Alpha Vantage / Demo
│   ├── sentiment_service.py    # AI sentiment (GPT-4.1-mini)
│   ├── trading_engine.py       # Paper trading simulation
│   └── settings_manager.py     # Settings CRUD
├── frontend/                   # React PWA
│   ├── public/
│   │   ├── manifest.json       # PWA manifest
│   │   ├── service-worker.js   # PWA service worker
│   │   └── icon-*.png          # App icons
│   └── src/
│       ├── App.js              # Main dashboard
│       └── components/         # 9 modular components
├── desktop/                    # Electron Desktop App
│   ├── main.js                 # Electron main process
│   ├── preload.js              # Context bridge
│   ├── package.json            # electron-builder config
│   ├── assets/icon.png         # App icon
│   ├── .github/workflows/      # CI/CD auto-build on tag push
│   └── README.md               # Build instructions
```

## What's Implemented
- [x] Full-stack app (React + FastAPI + MongoDB)
- [x] AI Sentiment Analysis (GPT-4.1-mini)
- [x] Paper Trading Engine
- [x] Real-time Dashboard
- [x] Upstox OAuth Integration (live data, portfolio, orders)
- [x] Live News API Integration
- [x] Trade History tab
- [x] Frontend Refactored (9 components)
- [x] PWA (installable from browser)
- [x] **Electron Desktop App** (Windows .exe + Mac .dmg)
- [x] **Auto-Update** via GitHub Releases
- [x] **System Tray** support (minimize to tray)
- [x] **GitHub Actions CI/CD** workflow for auto-build

## Backlog
### P0 - Wire AI signals → Upstox auto order execution
### P1 - Trade analytics with P&L charts, CSV export
### P2 - Telegram/Email notifications
### P3 - Option chain, multi-strategy, backtesting
