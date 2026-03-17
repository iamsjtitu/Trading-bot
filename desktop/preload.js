const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkUpdates: () => ipcRenderer.send('check-updates'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, s) => cb(s)),
});
