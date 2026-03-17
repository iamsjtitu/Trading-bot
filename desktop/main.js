const { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// App URL - Change this to your deployed URL
const APP_URL = 'https://trading-decision.emergent.host/';

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ==================== Auto Updater Config ====================
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    sendToRenderer('update-status', 'Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    sendToRenderer('update-status', `Update v${info.version} available!`);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `AI Trading Bot v${info.version} available hai!`,
      detail: `Current: v${app.getVersion()}\nNew: v${info.version}\n\nDownload karein?`,
      buttons: ['Download', 'Baad mein'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
        sendToRenderer('update-status', 'Downloading update...');
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('update-status', 'App is up to date');
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    sendToRenderer('update-progress', pct);
    if (mainWindow) mainWindow.setProgressBar(pct / 100);
  });

  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.setProgressBar(-1);
    sendToRenderer('update-status', 'Update ready! Restart to apply.');
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update download ho gaya!',
      detail: 'App restart karne par new version install ho jayega.',
      buttons: ['Restart Now', 'Baad mein'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) {
        isQuitting = true;
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    sendToRenderer('update-status', 'Update check failed');
    console.error('Auto-updater error:', err);
  });

  // Check for updates on startup (after 5 seconds)
  setTimeout(() => autoUpdater.checkForUpdates(), 5000);
  // Check every 30 minutes
  setInterval(() => autoUpdater.checkForUpdates(), 30 * 60 * 1000);
}

function sendToRenderer(channel, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

// ==================== Window Creation ====================
function createMainWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'AI Trading Bot',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
    backgroundColor: '#f0f4ff',
  });

  // Load the web app
  mainWindow.loadURL(APP_URL);

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Handle external links - open in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon({
          title: 'AI Trading Bot',
          content: 'App tray mein chal raha hai. Trading continue ho raha hai.',
          iconType: 'info',
        });
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ==================== System Tray ====================
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch (e) {
    trayIcon = null;
  }

  tray = new Tray(trayIcon || nativeImage.createEmpty());
  tray.setToolTip('AI Trading Bot - Running');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open AI Trading Bot',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else createMainWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => autoUpdater.checkForUpdates()
    },
    { type: 'separator' },
    {
      label: `Version ${app.getVersion()}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit AI Trading Bot',
      click: () => { isQuitting = true; app.quit(); }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    else createMainWindow();
  });
}

// ==================== App Menu ====================
function createMenu() {
  const template = [
    {
      label: 'AI Trading Bot',
      submenu: [
        { label: `Version ${app.getVersion()}`, enabled: false },
        { type: 'separator' },
        { label: 'Check for Updates', click: () => autoUpdater.checkForUpdates() },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { label: 'DevTools', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { isQuitting = true; app.quit(); } }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ==================== App Events ====================
app.whenReady().then(() => {
  createMainWindow();
  createTray();
  createMenu();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
});

app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // On Windows/Linux, keep running in tray
  }
});

// IPC handlers
ipcMain.on('check-updates', () => autoUpdater.checkForUpdates());
ipcMain.on('install-update', () => { isQuitting = true; autoUpdater.quitAndInstall(); });
ipcMain.handle('get-version', () => app.getVersion());
