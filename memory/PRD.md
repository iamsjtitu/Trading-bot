# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses GPT-4o for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Standalone desktop application for Windows/Mac with auto-updates.

## Architecture (v4.5.0)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: Node.js/Express (port 8002, proxied through Python FastAPI on 8001)
- **Desktop**: Electron
- **AI**: GPT-4o via Emergent LLM Key
- **Broker**: Upstox API v2 (LIVE mode)
- **Database**: Local JSON (lowdb)

## What's Implemented

### v4.5.0 (Current - Tax Report Fix)
1. **Tax Report Backend Fixes**:
   - Fixed variable ordering crash bug (todayPositions/totalBuyValue used before defined)
   - Added `from_date`/`to_date` params to Upstox P&L API for full FY coverage
   - Fixed FY format parsing (accepts "2025-26", "25-26", "2526")
   - Fixed Upstox charges mapping (nested `charges_breakdown.taxes.stt/gst/stamp_duty`)
   - Proper pagination with configurable page_size (up to 5000)
2. **Tax Report Frontend Overhaul**:
   - Correctly maps nested backend response (summary, charges, tax, compliance)
   - Three views: Summary, Monthly breakdown, Trade details
   - Shows all charge items: Brokerage, STT, GST, Stamp Duty, SEBI, Other Charges
   - ITR form type, audit status, filing due date
   - Refresh button, FY selector, data source badge (Upstox Live / Local)

### v4.4.0
- GPT-4.1-mini references removed everywhere, fixed to GPT-4o
- LIVE P&L reads ALL Upstox positions (including closed qty=0)
- Portfolio endpoint properly separates realized vs unrealized P&L
- 5 trades per instrument (configurable)
- Journal AI reviews use GPT-4o

### v4.3.x
- Trade limit increase (5 concurrent trades per instrument)
- Auto-entry OFF setting respected
- AI Engine fixes

## Trade Limits
- Max 5 open trades per selected instrument (configurable in Settings → Risk)
- No per-direction (CALL/PUT) limit within instrument

## Known Limitations
- Upstox access tokens expire daily - user needs to reconnect broker for fresh data
- Tax report accuracy depends on Upstox API data availability (T+1 settlement delay)
- App.js is monolithic (800+ lines) - needs refactoring

## Backlog
### P0 (Critical)
- None currently

### P1 (High Priority)
- Desktop build v4.5.0
- Risk Settings review (SL 25% vs Target 10% is poor ratio)

### P2 (Medium Priority)
- Stock Options trading support
- Telegram notifications
- Strategy Backtesting
- Dark Mode theme
- Export Journal to PDF
- App.js refactoring

### P3 (Low Priority)
- Multi-broker support (Zerodha, Angel One, 5paisa, etc.)
