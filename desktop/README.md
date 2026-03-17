# AI Trading Bot - Desktop App

Fully local desktop application. No web server needed! Everything runs on your computer.

## What You Need
- **Python 3.9+** (python.org)
- **Node.js 18+** (nodejs.org)
- **Git** (optional, for auto-updates)

## Quick Setup

### Windows
```
Double-click: desktop\scripts\setup-windows.bat
```

### Mac / Linux
```bash
chmod +x desktop/scripts/setup-mac.sh
./desktop/scripts/setup-mac.sh
```

## Manual Setup (Step by Step)

### 1. Install Backend Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Create Backend Config
```bash
# Copy template
cp backend/.env.template backend/.env

# Edit .env file - add your Emergent LLM Key
# MONGO_URL= (leave empty for local file DB)
# EMERGENT_LLM_KEY=your_key_here
```

### 3. Build Frontend
```bash
cd frontend
npm install
npm run build
```

### 4. Install Desktop Dependencies
```bash
cd desktop
npm install
```

### 5. Run the App
```bash
cd desktop
npm start
```

## Build Installers

### Windows (.exe)
```bash
cd desktop
npm run build:win
# Output: desktop/dist/AI Trading Bot Setup x.x.x.exe
```

### Mac (.dmg)
```bash
cd desktop
npm run build:mac
# Output: desktop/dist/AI Trading Bot-x.x.x.dmg
```

### Both Platforms
```bash
cd desktop
npm run build:all
```

## Auto-Update via GitHub Releases

### Setup (One Time)
1. Push this project to GitHub
2. Edit `desktop/package.json`:
   ```json
   "publish": [{
     "provider": "github",
     "owner": "YOUR_USERNAME",
     "repo": "YOUR_REPO"
   }]
   ```
3. Create a GitHub Personal Access Token (Settings > Developer > Tokens)
4. Set token: `set GH_TOKEN=your_token` (Windows) or `export GH_TOKEN=your_token` (Mac)

### Release New Version
1. Update version in `desktop/package.json`: `"version": "1.1.0"`
2. Build & publish:
   ```bash
   npm run publish:win   # Windows
   npm run publish:mac   # Mac
   npm run publish:all   # Both
   ```
3. Go to GitHub > Releases > Edit draft > Publish

### How Auto-Update Works
1. App checks for updates on startup + every 30 minutes
2. If update found → download prompt
3. Download completes → restart prompt
4. App restarts with new version!

### GitHub Actions (CI/CD)
Push a tag to auto-build:
```bash
git tag v1.1.0
git push --tags
```
GitHub Actions will automatically build Windows + Mac installers and create a draft release.

## Architecture
```
┌─────────────────────────────────────┐
│         Electron Desktop App        │
│                                     │
│  ┌────────────┐  ┌──────────────┐  │
│  │  React UI  │  │ System Tray  │  │
│  │  (bundled) │  │ Notifications│  │
│  └──────┬─────┘  └──────────────┘  │
│         │                           │
│  ┌──────┴──────────────────────┐   │
│  │  FastAPI Backend (local)     │   │
│  │  - AI Sentiment Analysis     │   │
│  │  - Paper/Live Trading        │   │
│  │  - Upstox API Integration    │   │
│  └──────┬──────────────────────┘   │
│         │                           │
│  ┌──────┴──────────────────────┐   │
│  │  Local File DB (JSON)        │   │
│  │  ~/AppData/ai-trading-bot/   │   │
│  │  No MongoDB needed!          │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
         │ Internet (required for)
    ┌────┴────────────────┐
    │  - Upstox API       │
    │  - News APIs        │
    │  - AI Analysis      │
    └─────────────────────┘
```

## Data Storage
- Settings, trades, portfolio → `%APPDATA%/ai-trading-bot/data/` (Windows) or `~/Library/Application Support/ai-trading-bot/data/` (Mac)
- Local JSON files, no database install needed
- Data persists between app restarts

## Troubleshooting

### "Python not found"
Install Python 3.9+ from python.org. Make sure to check "Add to PATH" during install.

### "Backend did not start"
- Check Python is installed: `python --version`
- Install dependencies: `pip install -r backend/requirements.txt`
- Check port 8765 is free

### Mac: "App is damaged"
Run in Terminal: `xattr -cr "/Applications/AI Trading Bot.app"`

### Windows: SmartScreen warning
Click "More info" → "Run anyway" (unsigned app)
