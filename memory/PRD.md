# AI Trading Bot - Product Requirements Document

## Architecture (v4.4.0)
- **Backend**: Node.js/Express (port 8002)
- **AI**: GPT-4o via Emergent LLM Key (FIXED: was gpt-4.1-mini which silently failed)
- **Broker**: Upstox (LIVE mode)

## v4.4.0 Fixes
1. **GPT-4.1-mini references removed EVERYWHERE** (settings.js default, journal.js x2, SettingsPanel.js display, DB saved value)
2. **LIVE P&L now reads ALL Upstox positions** (including closed qty=0) - fixes massive P&L mismatch
3. **Portfolio endpoint** properly separates realized vs unrealized P&L from Upstox
4. **5 trades per instrument** (configurable)
5. **Journal AI reviews** now use GPT-4o (were failing with wrong model)

## Trade Limits
- Max 5 open trades per selected instrument (configurable in Settings → Risk)
- No per-direction (CALL/PUT) limit within instrument

## Backlog
### P1: Desktop build v4.4.0, Live verification
### P2: Stock Options, Telegram, Backtesting, Dark Mode
