const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('get-version'),

  // Auto-update
  checkUpdates: () => ipcRenderer.send('check-updates'),
  installUpdate: () => ipcRenderer.send('install-update'),

  // Listen for update events
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_event, status) => callback(status));
  },
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update-progress', (_event, percent) => callback(percent));
  },
});
