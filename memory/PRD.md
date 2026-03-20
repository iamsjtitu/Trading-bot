# AI Trading Bot - Product Requirements Document

## Original Problem Statement
AI-powered automated options trading bot with Upstox integration, sentiment analysis (GPT-4o), and desktop app.

## Architecture (v4.3.0)
- **Backend**: Node.js/Express (port 8002)
- **Frontend**: React + Tailwind + Shadcn
- **Desktop**: Electron
- **Database**: lowdb (JSON)
- **AI**: GPT-4o via Emergent LLM Key

## Implemented Features
- Full news scraping (11 sources) + GPT-4o sentiment analysis
- Automated signal generation with CALL/PUT mapping
- Paper/Live trading with Upstox integration
- Emergency stop (persists to backend)
- Auto-entry/exit controls (properly enforced)
- Max per trade limit (strict with LTP check)
- **Max open trades limit: 5 across all instruments** (configurable in Settings → Risk)
- AI Trade Journal with learning-based blocking
- Sentiment-signal mismatch validation
- India-specific market context in AI prompt
- Live P&L auto-refresh, Technical Analysis, Tax Reports

## Trade Limits
- 1 CALL + 1 PUT per instrument (duplicate protection)
- Total max 5 open trades across all instruments (configurable via `max_open_trades`)

## Backlog
### P1
- Desktop build v4.3.0
- Live broker verification

### P2
- Stock Options support
- Telegram notifications
- Strategy Backtesting
- Dark Mode, Export Journal PDF
