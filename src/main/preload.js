import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('isolatedBrowser', {
  createContext: (url) => ipcRenderer.invoke('contexts:create', { url }),
  switchContext: (id) => ipcRenderer.invoke('contexts:switch', { id }),
  closeContext: (id) => ipcRenderer.invoke('contexts:close', { id }),
  listContexts: () => ipcRenderer.invoke('contexts:list'),
  resizeActiveView: (bounds) => ipcRenderer.send('view:resize', bounds),
});
