# AI Trading Bot - Desktop App (Electron)

## Quick Start

### Prerequisites
- Node.js 18+ installed
- Git installed

### Setup
```bash
cd desktop
npm install
```

### Run in Development
```bash
npm start
```

### Build Locally (No Publishing)
```bash
# Windows
npm run build:win

# Mac
npm run build:mac

# Both
npm run build:all
```

Built files will be in `desktop/dist/` folder.

---

## Auto-Update Setup (via GitHub Releases)

### Step 1: Create GitHub Repository
1. Push this project to GitHub
2. Note your **username** and **repo name**

### Step 2: Configure GitHub Details
Open `desktop/package.json` and update:
```json
"publish": [
  {
    "provider": "github",
    "owner": "YOUR_GITHUB_USERNAME",
    "repo": "YOUR_REPO_NAME",
    "private": false
  }
]
```

### Step 3: Create GitHub Token
1. Go to GitHub → Settings → Developer Settings → Personal Access Tokens
2. Create a token with `repo` scope
3. Set environment variable:
```bash
# Windows
set GH_TOKEN=your_github_token

# Mac/Linux
export GH_TOKEN=your_github_token
```

### Step 4: Publish a Release
```bash
# Bump version first
# Edit package.json version: "1.0.0" → "1.1.0"

# Publish to GitHub Releases
npm run publish:win    # Windows
npm run publish:mac    # Mac
npm run publish:all    # Both
```

This will:
- Build the app
- Create a GitHub Release (draft)
- Upload installer files (.exe, .dmg)
- Upload `latest.yml` / `latest-mac.yml` (metadata for auto-updater)

### Step 5: Publish the Release
1. Go to GitHub → Releases
2. Find the draft release
3. Add release notes
4. Click "Publish release"

### How Auto-Update Works
1. App checks for updates on startup (after 5 sec)
2. Checks every 30 minutes
3. If new version found → asks user to download
4. Download completes → asks to restart
5. App restarts with new version!

---

## GitHub Actions (CI/CD Auto-Build)

Create `.github/workflows/build.yml` in your repo for automated builds on every tag push.

### Workflow (already created in this project):
- Push a tag: `git tag v1.1.0 && git push --tags`
- GitHub Actions automatically builds Windows + Mac
- Creates a draft release with all installers
- Just publish the release!

---

## Folder Structure
```
desktop/
├── main.js          # Electron main process
├── preload.js       # Context bridge (IPC)
├── package.json     # Config + electron-builder settings
├── assets/
│   └── icon.png     # App icon (512x512)
├── .github/
│   └── workflows/
│       └── build.yml  # CI/CD workflow
└── dist/            # Built installers (after build)
```

## Troubleshooting

### Mac: "App is damaged" error
Since we don't have code signing, Mac may block the app:
```bash
# Allow app in Terminal
xattr -cr "/Applications/AI Trading Bot.app"
```

### Windows: SmartScreen warning
Click "More info" → "Run anyway" (unsigned app warning)

### Update not working
- Check GitHub token is set
- Check `publish` config has correct owner/repo
- Make sure release is published (not draft)
- Check internet connection
