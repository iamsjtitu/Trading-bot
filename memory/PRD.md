# AI Trading Bot - Product Requirements Document

## Original Problem Statement
Build an AI-powered automated options trading bot with multi-broker support, AI sentiment analysis, and desktop app delivery (Windows/Mac).

## Architecture
- **Frontend:** React + Tailwind + Shadcn/UI + Chart.js
- **Backend (Desktop - PRIMARY):** Node.js Express (inside Electron) with lowdb
- **Backend (Web - DEPRECATED):** Python FastAPI + MongoDB (preview environment only)
- **Desktop:** Electron + electron-builder + electron-updater
- **AI:** OpenAI GPT-4o via Emergent LLM Key
- **Broker:** Upstox (primary), framework for Zerodha, Angel One, 5paisa, Paytm Money, IIFL

## Current Version: v3.2.7

## What's Implemented
- News analysis from 11 sources with AI sentiment (Bullish/Bearish)
- Auto-trade entry/exit based on AI signals (Paper + Live modes)
- Multi-instrument support: Nifty, BankNifty, FinNifty, MidcapNifty, Sensex, Bankex
- Option Chain with live data from Upstox
- Trade Analytics with charts (cumulative P&L, win/loss, CALL/PUT distribution)
- Tax Reports with Summary and Monthly views
- Risk Management dashboard
- Fix Trade Data (Sync with Upstox) utility
- Desktop app with auto-updates via GitHub Releases

## Completed (This Session - 19 Mar 2026)
- **Tax Report Fix (P0)**: Fixed field name mismatches between backend and frontend in TaxReports.js. The component now correctly maps backend fields using nullish coalescing (`??`) to support both Python and Node.js backends. Broker P&L override now properly updates `total_tax_liability`, `stcg_tax`, `cess`, `effective_tax_rate`, profit/loss split, and turnover. Monthly breakdown computed from trade details.

## Bug Fix History
- v3.2.7: Fixed API response parsing for live total P&L in Analytics and Tax tabs
- v3.2.6: Fix Trade Data endpoint also corrects exit_price from Upstox trade book
- v3.2.5: Fixed "axios is not defined" crash in Fix Trade Data button
- v3.2.4: Fix Trade Data feature + correct broker fill price storage
- v3.2.3: Signal generation fixes (daily limit logic, market hours check)
- v3.2.0: Fixed SyntaxError crash in news.js (duplicate `activeInst` declaration)
- v3.1.2-v3.1.9: Duplicate trade protection, manual exit, P&L display, lot sizes, product 'D'->'I'

## Pending
- P0: Trigger desktop app build v3.2.8 (after tax fix)
- P1: Full end-to-end user verification (signals, auto-trade, auto-exit, reporting)

## Future/Backlog
- Remove deprecated Python backend (`/app/backend`)
- Stock Options trading support
- Telegram notifications integration
- Refactor news.js and trading.js into smaller modules
