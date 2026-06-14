const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('electronToast', {
  notifyClicked: () => {},
});
