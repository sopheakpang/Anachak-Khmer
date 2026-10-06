'use strict';
// The game asks the window to turn 16:9 for the Kingdom tab and back to 9:16 (D51).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('templesDesktop', {
  setLayout: (layout) => {
    if (layout === 'portrait' || layout === 'landscape') ipcRenderer.send('temples:layout', layout);
  },
});
