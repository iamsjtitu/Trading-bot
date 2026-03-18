# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot that connects to world news, uses AI (GPT-4o) for sentiment analysis (Bullish/Bearish), and automatically executes options (Call/Put) trades on Upstox. Final form: standalone desktop application (.exe/.dmg) with auto-updates.

## All Completed Features
- Real-time dashboard with portfolio cards, market ticker, risk management
- AI sentiment analysis (multi-factor, sector detection, trend-aware, weighted keywords)
- Paper Trading & Live Trading (Upstox) with real price-based auto-exit + sell orders
- News fetching with deduplication from: Moneycontrol, Economic Times, NSE India, NewsAPI, Alpha Vantage
- Auto-trading (auto-exit, auto-entry, auto-analysis)
- Trade Analytics with P&L charts (Chart.js)
- Desktop Notifications + Telegram Notifications + Daily P&L Summary
- Advanced Trade History (filters, sort, CSV export)
- Market Closed status detection (9:15 AM - 3:30 PM IST)
- Auto square-off warning at 3:15 PM IST via Telegram
- Historical pattern matching for AI confidence adjustment
- **Capital Gains Tax Reports** - Indian tax system (STCG @15%, Cess @4%)
  - FY year selector, Summary & Monthly views
  - Tax Calculation, Trading Summary, F&O Turnover, Audit check
  - PDF export (professional formatted)
  - Excel export (3 sheets: Tax Summary, Monthly, Trade Details)
- CI/CD pipeline with auto-updates (GitHub Actions)
- Mode-aware dashboard (LIVE shows Upstox data, PAPER shows paper data)

## Upcoming Tasks (P1)
- Telegram end-to-end test (needs Bot Token + Chat ID)
- Desktop build verify (v1.3.2 pending CI fix with Node 18)

## Future/Backlog
- Additional brokers support
- Sector-wise P&L breakdown heat maps
- ITR-3 form pre-fill helper
- Advance Tax quarterly calculation

## Key Files
- `/app/frontend/src/components/TaxReports.js` - Tax report UI
- `/app/backend/tax_service.py` - Tax calculation + PDF/Excel generation
- `/app/backend/server.py` - All API endpoints
- `/app/desktop/routes/trading.js` - Node.js tax endpoints + live trading
