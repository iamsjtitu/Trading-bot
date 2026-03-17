/**
 * AI Trading Bot - Electron Desktop Application
 * Architecture: Express server inside Electron (same as Mill Entry System)
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const compression = require('compression');

// ============ ERROR LOGGING ============
const errorLogPath = path.join(app.getPath('userData'), 'ai-trader-error.log');
function logError(ctx, err) {
  const msg = `[${new Date().toISOString()}] [${ctx}] ${err && err.stack ? err.stack : err}\n`;
  try { fs.appendFileSync(errorLogPath, msg); } catch(_) {}
  console.error(msg);
}
process.on('uncaughtException', (err) => logError('UNCAUGHT', err));
process.on('unhandledRejection', (r) => logError('UNHANDLED', r));

// ============ GLOBALS ============
let mainWindow = null;
let tray = null;
let server = null;
const API_PORT = 9877;
const dataDir = path.join(app.getPath('userData'), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// ============ JSON DATABASE ============
class JsonDatabase {
  constructor(folder) {
    this.folder = folder;
    this.dbFile = path.join(folder, 'trading-bot-data.json');
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.dbFile)) return JSON.parse(fs.readFileSync(this.dbFile, 'utf8'));
    } catch (e) { logError('DB_LOAD', e); }
    return this._defaults();
  }

  _defaults() {
    return {
      settings: {
        trading_mode: 'PAPER',
        broker: { api_key: '', api_secret: '', redirect_uri: '', access_token: '', token_timestamp: '' },
        risk: { initial_capital: 500000, daily_limit: 100000, max_per_trade: 20000, risk_tolerance: 'medium', stop_loss_pct: 25, target_pct: 50 },
        schedule: { enabled: false, trading_days: ['Monday','Tuesday','Wednesday','Thursday','Friday'], start_time: '09:15', end_time: '15:30' },
        news: { sources: ['demo'], newsapi_key: '', alphavantage_key: '', min_confidence: 60 },
        auto_trading: { auto_exit: true, auto_entry: false, auto_analysis: true, target_pct: 10, stoploss_pct: 25, analysis_interval_minutes: 5 },
        ai: { emergent_llm_key: '' }
      },
      portfolio: { initial_capital: 500000, current_value: 500000, total_pnl: 0, active_positions: 0, total_trades: 0, winning_trades: 0 },
      trades: [],
      signals: [],
      news_articles: [],
    };
  }

  save() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._doSave(), 100);
  }

  _doSave() {
    try {
      const tmp = this.dbFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      if (fs.existsSync(this.dbFile)) fs.copyFileSync(this.dbFile, this.dbFile + '.bak');
      fs.renameSync(tmp, this.dbFile);
    } catch (e) { logError('DB_SAVE', e); }
  }
}

// ============ EXPRESS API SERVER ============
function createApiServer(db) {
  const apiApp = express();
  apiApp.use(compression());
  apiApp.use(cors());
  apiApp.use(express.json({ limit: '5mb' }));

  // Load route modules
  const routeModules = [
    { name: 'settings', load: () => require('./routes/settings')(db) },
    { name: 'portfolio', load: () => require('./routes/portfolio')(db) },
    { name: 'news', load: () => require('./routes/news')(db) },
    { name: 'trading', load: () => require('./routes/trading')(db) },
    { name: 'upstox', load: () => require('./routes/upstox')(db) },
  ];

  let loaded = 0;
  for (const rm of routeModules) {
    try { apiApp.use(rm.load()); loaded++; }
    catch (e) { logError('ROUTE_' + rm.name, e); }
  }
  console.log(`[Routes] ${loaded}/${routeModules.length} loaded`);

  // Health endpoint
  apiApp.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString(), services: { news: 'active', sentiment: 'active', trading: 'active' } });
  });

  // Serve frontend
  const frontendDir = path.join(__dirname, 'frontend-build');
  if (fs.existsSync(frontendDir)) {
    apiApp.use(express.static(frontendDir, { index: false, maxAge: '1y' }));
    apiApp.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        let html = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
        const port = server ? server.address().port : API_PORT;
        html = html.replace('</head>', `<script>window.REACT_APP_BACKEND_URL='http://127.0.0.1:${port}';</script></head>`);
        res.type('html').send(html);
      } else {
        res.status(404).json({ detail: 'Not found' });
      }
    });
  }

  return new Promise((resolve, reject) => {
    server = apiApp.listen(API_PORT, '127.0.0.1', () => {
      console.log(`Server on port ${API_PORT}`);
      resolve(API_PORT);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        server = apiApp.listen(0, '127.0.0.1', () => {
          resolve(server.address().port);
        });
      } else reject(err);
    });
  });
}

// ============ MAIN WINDOW ============
async function createMainWindow(port) {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 700,
    show: false, backgroundColor: '#f0f4ff',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    setupAutoUpdater();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      window.REACT_APP_BACKEND_URL = 'http://127.0.0.1:${port}';
    `).catch(() => {});
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (tray) tray.displayBalloon({ title: 'AI Trading Bot', content: 'Tray mein chal raha hai.', iconType: 'info' });
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Menu
  const menu = Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'Refresh', accelerator: 'F5', click: () => mainWindow?.reload() },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { app.isQuitting = true; app.quit(); } }
    ]},
    { label: 'Edit', submenu: [{ role: 'undo' },{ role: 'redo' },{ type: 'separator' },{ role: 'cut' },{ role: 'copy' },{ role: 'paste' },{ role: 'selectAll' }]},
    { label: 'View', submenu: [{ role: 'zoomIn' },{ role: 'zoomOut' },{ role: 'resetZoom' },{ type: 'separator' },{ role: 'togglefullscreen' }]},
    { label: 'Help', submenu: [
      { label: 'Check Updates', click: () => autoUpdater.checkForUpdates().catch(() => {}) },
      { label: 'DevTools', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
      { type: 'separator' },
      { label: 'About', click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: 'AI Trading Bot', message: `Version: v${app.getVersion()}`, detail: 'AI-Powered Options Trading Bot\nUpstox Integration\n\nData: ' + dataDir }) }
    ]}
  ]);
  Menu.setApplicationMenu(menu);
}

// ============ SYSTEM TRAY ============
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let icon;
  try { icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }); }
  catch(e) { icon = nativeImage.createEmpty(); }

  tray = new Tray(icon);
  tray.setToolTip('AI Trading Bot');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } }},
    { type: 'separator' },
    { label: `v${app.getVersion()}`, enabled: false },
    { label: 'Check Updates', click: () => autoUpdater.checkForUpdates().catch(() => {}) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

// ============ AUTO UPDATER ============
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    if (!mainWindow) return;
    dialog.showMessageBox(mainWindow, {
      type: 'info', title: 'Update Available',
      message: `v${info.version} available!`,
      detail: `Current: v${app.getVersion()}\nDownload karein?`,
      buttons: ['Download', 'Later']
    }).then(r => { if (r.response === 0) autoUpdater.downloadUpdate(); });
  });

  autoUpdater.on('download-progress', (p) => {
    if (mainWindow) mainWindow.setProgressBar(Math.round(p.percent) / 100);
  });

  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.setProgressBar(-1);
    dialog.showMessageBox(mainWindow, {
      type: 'info', title: 'Update Ready',
      message: 'Update ready! Restart karein?',
      buttons: ['Restart', 'Later']
    }).then(r => { if (r.response === 0) { app.isQuitting = true; autoUpdater.quitAndInstall(); } });
  });

  autoUpdater.on('error', (e) => logError('UPDATER', e));
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
}

// ============ APP LIFECYCLE ============
app.whenReady().then(async () => {
  // Splash screen
  const splash = new BrowserWindow({ width: 400, height: 300, frame: false, resizable: false, center: true, alwaysOnTop: true });
  splash.loadURL(`data:text/html,<html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:linear-gradient(135deg,#3b82f6,#8b5cf6);font-family:sans-serif;color:white"><div style="text-align:center"><h1 style="font-size:28px;margin:0 0 8px">AI Trading Bot</h1><p style="font-size:14px;opacity:0.8">Starting...</p><div style="margin-top:20px;width:200px;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;overflow:hidden"><div style="width:30%;height:100%;background:white;border-radius:2px;animation:l 1.5s infinite ease-in-out"></div></div></div><style>@keyframes l{0%{margin-left:0;width:30%}50%{width:50%}100%{margin-left:70%;width:30%}}</style></body></html>`);

  try {
    const db = new JsonDatabase(dataDir);
    const port = await createApiServer(db);
    splash.close();
    createTray();
    await createMainWindow(port);
  } catch (err) {
    splash.close();
    dialog.showErrorBox('Error', `Start nahi ho paya: ${err.message}`);
    app.quit();
  }
});

app.on('before-quit', () => { app.isQuitting = true; if (server) server.close(); });
app.on('window-all-closed', () => {});
app.on('activate', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });

ipcMain.handle('get-version', () => app.getVersion());
ipcMain.on('check-updates', () => autoUpdater.checkForUpdates().catch(() => {}));
