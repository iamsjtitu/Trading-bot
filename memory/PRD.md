# AI-Powered Options Trading Bot - PRD

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses GPT-4o for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on various brokers (starting with Upstox). Standalone desktop app for Windows/Mac with auto-update.

## Core Architecture
- **Backend**: Node.js (Express) at `/app/desktop/`
- **Frontend**: React at `/app/frontend/`
- **Desktop**: Electron
- **Database**: lowdb (JSON file-based)
- **AI**: GPT-4o via Emergent LLM Key
- **APIs**: Upstox REST API v2, Telegram Bot API

## Current Version: v7.0.1

## Completed Features
- AI-powered sentiment analysis (GPT-4o)
- Live news from 11 sources
- Paper & Live trading modes
- Upstox broker integration
- Real-time market data & Option Chain
- AI Guards (8 safety guards)
- AI Exit Advisor (HOLD/EXIT recommendations)
- Kelly Criterion position sizing
- Options Greeks & IV analysis
- Telegram alerts (7 alert types)
- AI Morning Briefing on Telegram
- Tax Reporting
- Auto-update mechanism
- Custom About dialog & footer content
- Deep code audit with 7 bug fixes (v7.0.0)
- Version reference fix in SettingsPanel.js (v7.0.1)

## Completed Tasks (Chronological)
- [2026-02] v1.0-v6.0: Core features built
- [2026-02] v7.0.0: Deep audit, 7 bug fixes, About/footer content update
- [2026-02] v7.0.1: Version bump + SettingsPanel.js version references fixed

## Pending/Backlog
- **P0**: Desktop app rebuild for v7.0.1
- **P1**: Refactor App.js (800+ lines) into smaller components
- **P2**: Multi-broker support (Zerodha, Angel One, 5paisa, Paytm Money, IIFL)

## Key Files
- `/app/desktop/package.json` - v7.0.1
- `/app/desktop/main.js` - Electron main, About dialog
- `/app/desktop/web_server.js` - Express server, v7.0.1
- `/app/desktop/routes/` - API routes
- `/app/frontend/src/App.js` - Main UI, footer v7.0.1
- `/app/frontend/src/components/SettingsPanel.js` - Settings, Telegram, v7.0.1 refs
