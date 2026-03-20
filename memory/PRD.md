# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that:
- Connects to world news, uses AI (GPT-4o) for sentiment analysis
- Automatically executes options (Call/Put) trades on Upstox
- Desktop application with auto-updates
- Paper and Live trading modes

## Architecture (v4.3.0)
```
/app/
├── desktop/                  # Node.js/Express backend (port 8002)
│   ├── web_server.js
│   ├── package.json           # v4.3.0
│   └── routes/
│       ├── lib/
│       │   ├── signal_generator.js  # Safety: emergency stop, max_per_trade, CALL/PUT validation, journal blocking
│       │   ├── sentiment.js         # FIXED: Now uses GPT-4o (was failing with wrong model name)
│       │   └── technical_analysis.js
│       ├── news.js                  # FIXED: auto_entry check before trade execution
│       ├── trading.js               # FIXED: DB-direct reads for auto settings
│       ├── ai_engine.js             # FIXED: India-specific prompt, dynamic composite scoring
│       ├── settings.js              # POST /api/emergency-stop
│       └── ... (other routes)
├── frontend/
│   └── src/
│       ├── App.js
│       └── components/
│           ├── AutoTradingSettings.js  # Updated descriptions
│           └── ... (other components)
└── backend/                   # MINIMAL PROXY
    └── server.py
```

## Critical Fixes (v4.3.0)

### AI Analysis Fix (ROOT CAUSE of wrong trades)
- **Model name was wrong**: `openai/gpt-4.1-mini` → `gpt-4o` (Emergent API doesn't use provider prefix for OpenAI)
- **Result**: AI was silently failing, falling back to keyword-only analysis which was terrible
- **Keyword analysis mistakes**: "Crude oil fall" = BEARISH (wrong! It's BULLISH for India)
- **Now**: GPT-4o properly connected, India-specific market context in prompt

### Safety Fixes (v4.2.0-4.3.0)
- Emergency Stop persists to backend
- Auto-entry OFF properly blocks all trade execution
- Max per trade strictly enforced with actual LTP
- Sentiment-signal mismatch validation (BULLISH+BUY_PUT blocked)
- AI Journal blocks consistently losing combos
- Composite score trusts AI more when data is sparse

## Key Settings
- Target %: Should be HIGHER than SL % for good risk:reward
- Current user has Target=10%, SL=25% → BAD ratio (need 71% win rate to break even)
- Recommended: Target >= 1.5x SL (e.g., Target=30%, SL=20%)

## Backlog
### P1
- New desktop build (v4.3.0)
- User verification with live broker

### P2
- Increase trade limit per instrument
- Stock Options support
- Telegram notifications
- Strategy Backtesting
- Dark Mode, Export Journal PDF
