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
├── .github/workflows/build.yml # CI/CD - auto build on release tag
├── routes/                     # Node.js API routes (COMPLETE)
│   ├── settings.js             # Settings CRUD, trading schedule
│   ├── portfolio.js            # Portfolio summary, stats, combined-status
│   ├── news.js                 # News (Moneycontrol/ET/NSE/NewsAPI/AlphaVantage/Demo) + AI sentiment
│   ├── trading.js              # Signals, trades, auto-exit/entry, trade generation
│   └── upstox.js               # Upstox OAuth, market data, orders, P&L

backend/                        # FastAPI Backend (WEB version)
frontend/                       # React PWA (bundled in Electron via files)
```

## Key Features
- [x] Node.js backend routes (5 modules, 21+ endpoints)
- [x] AI Sentiment Analysis (Emergent LLM Key → OpenAI GPT-4.1-mini)
- [x] **Live News Scraping** - Moneycontrol, Economic Times, NSE India (FREE, no API key)
- [x] NewsAPI + Alpha Vantage support (with API keys)
- [x] Demo news mode for paper trading
- [x] Paper + Live trading modes
- [x] Upstox OAuth integration
- [x] Auto-update via GitHub Releases + update progress banner in UI
- [x] GitHub Actions CI/CD (auto build .exe/.dmg on tag push)
- [x] System tray, splash screen
- [x] Express 5.x compatible (wildcard route fix)
- [x] Multi-source news selection in Settings UI

## News Sources
| Source | Type | Cost | Status |
|--------|------|------|--------|
| Moneycontrol | RSS Scraping | Free | ✅ Working |
| Economic Times | RSS Scraping | Free | ✅ Working |
| NSE India | API Scraping | Free | ✅ Working |
| NewsAPI.org | API | Free tier (100/day) | ✅ Working |
| Alpha Vantage | API | Free tier (500/day) | ✅ Working |
| Demo | Built-in | Free | ✅ Working |

## GitHub CI/CD
- Owner: iamsjtitu
- Repo: Trading-bot
- Trigger: Push tag `v*` → Auto build Windows .exe + Mac .dmg
- Artifacts: .exe, latest.yml, .dmg, latest-mac.yml

## Backlog
### P0 - Frontend-build bundling in Electron (frontend-build path fix done)
### P1 - Wire AI signals → Upstox auto order execution
### P1 - Trade analytics with P&L charts, CSV export
### P2 - Telegram/Email notifications
### P2 - Additional broker support
