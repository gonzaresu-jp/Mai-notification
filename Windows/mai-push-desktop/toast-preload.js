const { contextBridge, ipcRenderer } = require('electron');
const channel = process.argv.find(a => a.startsWith('--toast-channel='));
const ch = channel ? channel.split('=')[1] : 'toast-clicked';
contextBridge.exposeInMainWorld('electronToast', {
  sendClick: () => ipcRenderer.send(ch),
});
