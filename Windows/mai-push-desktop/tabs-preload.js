const { contextBridge, ipcRenderer } = require('electron');

// タブバー (tabs.html) 専用プリロード：タブ操作のみ公開
contextBridge.exposeInMainWorld('tabAPI', {
  getTabs: () => ipcRenderer.invoke('tabs:get'),
  newTab: (url) => ipcRenderer.invoke('tab-new', url),
  closeTab: (id) => ipcRenderer.invoke('tab-close', id),
  activateTab: (id) => ipcRenderer.invoke('tab-activate', id),
  reloadTab: (id) => ipcRenderer.invoke('tab-reload', id),
  onUpdate: (cb) => ipcRenderer.on('tabs:update', () => { try { cb(); } catch (e) {} }),
});
