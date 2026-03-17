const { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const http = require('http');

// Config
const BACKEND_PORT = 8765;
const APP_URL = `http://localhost:${BACKEND_PORT}`;

let mainWindow = null;
let tray = null;
let backendProcess = null;
let isQuitting = false;

// ==================== Backend Management ====================
function getBackendPath() {
  const isDev = !app.isPackaged;
  if (isDev) {
    // Development: run from source
    return {
      type: 'python',
      path: path.join(__dirname, '..', 'backend'),
    };
  }
  // Production: use bundled backend
  const resourcesPath = process.resourcesPath;
  const backendDir = path.join(resourcesPath, 'backend');

  // Check for compiled executable first (PyInstaller)
  const exeName = process.platform === 'win32' ? 'server.exe' : 'server';
  const exePath = path.join(backendDir, 'dist', exeName);
  if (require('fs').existsSync(exePath)) {
    return { type: 'exe', path: exePath, cwd: backendDir };
  }

  // Fallback: run Python from source
  return { type: 'python', path: backendDir };
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const backend = getBackendPath();
    const env = {
      ...process.env,
      MONGO_URL: '',
      LOCAL_DB_PATH: path.join(app.getPath('userData'), 'data'),
      PORT: String(BACKEND_PORT),
    };

    console.log('Starting backend...', backend);

    if (backend.type === 'exe') {
      backendProcess = spawn(backend.path, [], { env, cwd: backend.cwd || path.dirname(backend.path) });
    } else {
      // Python source mode
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      backendProcess = spawn(pythonCmd, [
        '-m', 'uvicorn', 'server:app',
        '--host', '0.0.0.0',
        '--port', String(BACKEND_PORT),
      ], { env, cwd: backend.path });
    }

    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data}`);
      if (data.toString().includes('Application startup complete') || data.toString().includes('Uvicorn running')) {
        resolve();
      }
    });

    backendProcess.stderr.on('data', (data) => {
      console.log(`[Backend] ${data}`);
      if (data.toString().includes('Application startup complete') || data.toString().includes('Uvicorn running')) {
        resolve();
      }
    });

    backendProcess.on('error', (err) => {
      console.error('Backend spawn error:', err);
      reject(err);
    });

    backendProcess.on('exit', (code) => {
      console.log(`Backend exited with code ${code}`);
      if (!isQuitting) {
        dialog.showErrorBox('Backend Error', 'Backend server stopped. Please restart the app.');
      }
    });

    // Wait for backend to be ready (poll health endpoint)
    let attempts = 0;
    const checkReady = setInterval(() => {
      attempts++;
      http.get(`${APP_URL}/api/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(checkReady);
          console.log('Backend is ready!');
          resolve();
        }
      }).on('error', () => {
        if (attempts > 30) {
          clearInterval(checkReady);
          reject(new Error('Backend did not start in time'));
        }
      });
    }, 1000);
  });
}

function stopBackend() {
  if (backendProcess) {
    console.log('Stopping backend...');
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t']);
    } else {
      backendProcess.kill('SIGTERM');
    }
    backendProcess = null;
  }
}

// ==================== Auto Updater ====================
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `AI Trading Bot v${info.version} available hai!`,
      detail: `Current: v${app.getVersion()}\nNew: v${info.version}\n\nDownload karein?`,
      buttons: ['Download', 'Baad mein'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('App is up to date');
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) mainWindow.setProgressBar(Math.round(progress.percent) / 100);
  });

  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.setProgressBar(-1);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update download ho gaya! Restart karein?',
      buttons: ['Restart Now', 'Baad mein'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) {
        isQuitting = true;
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => console.error('Auto-updater error:', err));

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000);
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

  mainWindow.loadURL(APP_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

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

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ==================== System Tray ====================
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
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
    { label: 'Check for Updates', click: () => autoUpdater.checkForUpdates().catch(() => {}) },
    { type: 'separator' },
    { label: `Version ${app.getVersion()}`, enabled: false },
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
        { label: 'Check for Updates', click: () => autoUpdater.checkForUpdates().catch(() => {}) },
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
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
        { type: 'separator' }, { role: 'togglefullscreen' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ==================== App Lifecycle ====================
app.whenReady().then(async () => {
  createMenu();
  createTray();

  // Show splash/loading
  const splash = new BrowserWindow({
    width: 400, height: 300,
    transparent: false, frame: false,
    alwaysOnTop: true, resizable: false,
    webPreferences: { nodeIntegration: false },
  });
  splash.loadURL(`data:text/html,
    <html>
    <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:linear-gradient(135deg,#3b82f6,#8b5cf6);font-family:sans-serif;color:white;">
      <div style="text-align:center">
        <h1 style="font-size:28px;margin:0 0 8px 0">AI Trading Bot</h1>
        <p style="font-size:14px;opacity:0.8">Starting backend server...</p>
        <div style="margin-top:20px;width:200px;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;overflow:hidden">
          <div style="width:30%;height:100%;background:white;border-radius:2px;animation:loading 1.5s infinite ease-in-out"></div>
        </div>
      </div>
      <style>@keyframes loading{0%{margin-left:0;width:30%}50%{width:50%}100%{margin-left:70%;width:30%}}</style>
    </body></html>
  `);

  try {
    await startBackend();
    splash.close();
    createMainWindow();
    setupAutoUpdater();
  } catch (err) {
    splash.close();
    dialog.showErrorBox('Startup Error',
      `Backend start nahi ho paya.\n\n${err.message}\n\nCheck karein:\n1. Python 3.9+ installed hai?\n2. pip install -r requirements.txt kiya hai?\n3. Port ${BACKEND_PORT} free hai?`
    );
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms
});

// IPC handlers
ipcMain.on('check-updates', () => autoUpdater.checkForUpdates().catch(() => {}));
ipcMain.on('install-update', () => { isQuitting = true; autoUpdater.quitAndInstall(); });
ipcMain.handle('get-version', () => app.getVersion());
