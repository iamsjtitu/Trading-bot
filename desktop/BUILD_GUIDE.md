# AI Trading Bot - Desktop Build Guide (v15.0.0)

## Prerequisites
- Node.js v18+ & npm/yarn
- Git

## Build Steps

### 1. Install Desktop Dependencies
```bash
cd desktop
yarn install
```

### 2. Build Frontend (already done - frontend-build/ is included)
```bash
cd frontend
yarn install
yarn build
cp -r build/ ../desktop/frontend-build/
```

### 3. Build Desktop App

**Windows:**
```bash
cd desktop
yarn build:win
```
Output: `desktop/dist/AI-Trading-Bot-Setup-15.0.0.exe`

**Mac:**
```bash
cd desktop
yarn build:mac
```
Output: `desktop/dist/AI-Trading-Bot-15.0.0.dmg`

**Both:**
```bash
cd desktop
yarn build:all
```

### 4. Publish with Auto-Update (GitHub Releases)
```bash
# Set GitHub token
export GH_TOKEN=your_github_personal_access_token

# Publish for auto-updates
yarn publish:win    # Windows
yarn publish:mac    # Mac
yarn publish:all    # Both
```

## GitHub Release Setup
1. Create a GitHub Personal Access Token with `repo` scope
2. Set `GH_TOKEN` environment variable
3. Run publish command - it creates a GitHub Release with the installer
4. Users with existing installs will auto-update via electron-updater

## Build Configuration
- **App ID:** com.aitrader.bot
- **Publisher:** GitHub (iamsjtitu/Trading-bot)
- **Windows:** NSIS installer (x64)
- **Mac:** DMG (x64 + arm64)
- **Auto-Update:** electron-updater checks GitHub Releases

## What's in v15.0.0
- Critical live trading bug fixes (P&L sync, trade count, max trade amount)
- Max Daily Profit & Max Daily Loss AI Guards
- System Health Dashboard
- 13 news sources, 30 articles/cycle
- Dynamic versioning from package.json
- Telegram auto-connect fix
- App.js refactored into modular components
