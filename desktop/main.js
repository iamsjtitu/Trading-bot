/**
 * AI Trading Bot - Electron Desktop Application
 * Architecture: Express server inside Electron (same as Mill Entry System)
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const axios = require('axios');

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

// Update state - accessible via /api/update-status
const updateState = {
  status: 'idle', // idle, checking, available, downloading, downloaded, error, up-to-date
  currentVersion: '',
  newVersion: '',
  progress: 0,
  message: '',
};

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
        ai: { emergent_llm_key: '' },
        telegram: { enabled: false, bot_token: '', chat_id: '' },
        notifications: { desktop: true, telegram: false, on_signal: true, on_entry: true, on_exit: true },
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

  // ============ NOTIFICATION SYSTEM ============
  db.notify = function (type, title, body) {
    const settings = db.data?.settings || {};
    const notifSettings = settings.notifications || {};

    // Check if this notification type is enabled
    if (type === 'signal' && !notifSettings.on_signal) return;
    if (type === 'entry' && !notifSettings.on_entry) return;
    if (type === 'exit' && !notifSettings.on_exit) return;

    // Desktop notification (works even when minimized)
    if (notifSettings.desktop !== false) {
      try {
        if (Notification.isSupported()) {
          const notif = new Notification({ title: `AI Trading Bot - ${title}`, body, icon: path.join(__dirname, 'assets', 'icon.png'), silent: false });
          notif.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
          notif.show();
        }
      } catch (e) { console.error('[Notify] Desktop error:', e.message); }
    }

    // Telegram notification
    if (notifSettings.telegram && settings.telegram?.enabled && settings.telegram?.bot_token && settings.telegram?.chat_id) {
      const telegramUrl = `https://api.telegram.org/bot${settings.telegram.bot_token}/sendMessage`;
      axios.post(telegramUrl, {
        chat_id: settings.telegram.chat_id,
        text: `*${title}*\n${body}`,
        parse_mode: 'Markdown',
      }).catch(e => console.error('[Notify] Telegram error:', e.message));
    }

    console.log(`[Notify] [${type}] ${title}: ${body}`);
  };

  // Load route modules
  const routeModules = [
    { name: 'settings', load: () => require('./routes/settings')(db) },
    { name: 'portfolio', load: () => require('./routes/portfolio')(db) },
    { name: 'news', load: () => require('./routes/news')(db) },
    { name: 'trading', load: () => require('./routes/trading')(db) },
    { name: 'upstox', load: () => require('./routes/upstox')(db) },
    { name: 'tax', load: () => require('./routes/tax')(db) },
    { name: 'market_status', load: () => require('./routes/market_status')(db) },
    { name: 'extra_apis', load: () => require('./routes/extra_apis')(db) },
  ];

  let loaded = 0;
  for (const rm of routeModules) {
    try { apiApp.use(rm.load()); loaded++; console.log(`[Route OK] ${rm.name}`); }
    catch (e) { console.error(`[Route FAIL] ${rm.name}: ${e.message}`); logError('ROUTE_' + rm.name, e); }
  }
  console.log(`[Routes] ${loaded}/${routeModules.length} loaded`);

  // Health endpoint
  apiApp.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString(), version: app.getVersion(), routes_loaded: loaded, services: { news: 'active', sentiment: 'active', trading: 'active' } });
  });

  // Debug endpoint - helps diagnose desktop issues
  apiApp.get('/api/debug', (req, res) => {
    res.json({
      version: app.getVersion(),
      routes_loaded: loaded,
      db_keys: Object.keys(db.data || {}),
      settings_sources: db.data?.settings?.news?.sources || [],
      news_count: (db.data?.news_articles || []).length,
      trades_count: (db.data?.trades || []).length,
      signals_count: (db.data?.signals || []).length,
    });
  });

  // Update status endpoint - frontend can poll this
  apiApp.get('/api/update-status', (req, res) => {
    res.json(updateState);
  });

  // Trigger update check
  apiApp.post('/api/check-update', (req, res) => {
    autoUpdater.checkForUpdates().catch(() => {});
    res.json({ status: 'success', message: 'Checking for updates...' });
  });

  // Trigger download
  apiApp.post('/api/download-update', (req, res) => {
    autoUpdater.downloadUpdate().catch(() => {});
    res.json({ status: 'success', message: 'Downloading...' });
  });

  // Install update
  apiApp.post('/api/install-update', (req, res) => {
    app.isQuitting = true;
    autoUpdater.quitAndInstall();
  });

  // Serve frontend - check multiple possible locations
  const possiblePaths = [
    path.join(__dirname, 'frontend-build'),
    path.join(process.resourcesPath || __dirname, 'frontend-build'),
    path.join(__dirname, '..', 'frontend-build'),
    path.join(__dirname, '..', 'frontend', 'build'),
  ];
  const frontendDir = possiblePaths.find(p => fs.existsSync(path.join(p, 'index.html'))) || possiblePaths[0];
  console.log(`[Frontend] Looking in: ${frontendDir} (exists: ${fs.existsSync(frontendDir)})`);

  if (fs.existsSync(frontendDir)) {
    apiApp.use(express.static(frontendDir, { index: false, maxAge: '1y' }));

    // Catch-all: ONLY serve HTML for non-API routes
    apiApp.use((req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      try {
        let html = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
        const port = server ? server.address().port : API_PORT;
        html = html.replace('</head>', `<script>window.__API_PORT__=${port};</script></head>`);
        res.type('html').send(html);
      } catch (e) { next(e); }
    });
  }

  // Global error handler - catches all unhandled errors
  apiApp.use((err, req, res, next) => {
    console.error(`[API Error] ${req.method} ${req.path}:`, err.message || err);
    res.status(500).json({ status: 'error', message: err.message || 'Internal server error' });
  });

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
  updateState.currentVersion = app.getVersion();
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    updateState.status = 'checking';
    updateState.message = 'Checking for updates...';
    sendUpdateToRenderer();
  });

  autoUpdater.on('update-available', (info) => {
    updateState.status = 'available';
    updateState.newVersion = info.version;
    updateState.message = `v${info.version} available! Current: v${app.getVersion()}`;
    sendUpdateToRenderer();
  });

  autoUpdater.on('update-not-available', () => {
    updateState.status = 'up-to-date';
    updateState.message = `v${app.getVersion()} is the latest version`;
    sendUpdateToRenderer();
  });

  autoUpdater.on('download-progress', (p) => {
    updateState.status = 'downloading';
    updateState.progress = Math.round(p.percent);
    updateState.message = `Downloading: ${Math.round(p.percent)}% (${formatBytes(p.transferred)}/${formatBytes(p.total)})`;
    if (mainWindow) mainWindow.setProgressBar(Math.round(p.percent) / 100);
    sendUpdateToRenderer();
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateState.status = 'downloaded';
    updateState.newVersion = info.version;
    updateState.progress = 100;
    updateState.message = `v${info.version} ready to install! Restart to update.`;
    if (mainWindow) mainWindow.setProgressBar(-1);
    sendUpdateToRenderer();
  });

  autoUpdater.on('error', (e) => {
    updateState.status = 'error';
    updateState.message = `Update error: ${e.message || e}`;
    logError('UPDATER', e);
    sendUpdateToRenderer();
  });

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
}

function sendUpdateToRenderer() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript(`
      window.dispatchEvent(new CustomEvent('app-update', { detail: ${JSON.stringify(updateState)} }));
    `).catch(() => {});
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
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
