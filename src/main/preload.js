import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('isolatedBrowser', {
  createContext: (url) => ipcRenderer.invoke('contexts:create', { url }),
  switchContext: (id) => ipcRenderer.invoke('contexts:switch', { id }),
  closeContext: (id) => ipcRenderer.invoke('contexts:close', { id }),
  navigateContext: (id, url) => ipcRenderer.invoke('contexts:navigate', { id, url }),
  listContexts: () => ipcRenderer.invoke('contexts:list'),
});

contextBridge.exposeInMainWorld('accountMatrix', {
  getPlatforms: () => ipcRenderer.invoke('matrix:getPlatforms'),
  listAccounts: () => ipcRenderer.invoke('matrix:listAccounts'),
  addAccount: (payload) => ipcRenderer.invoke('matrix:addAccount', payload),
  collectHotspots: () => ipcRenderer.invoke('matrix:collectHotspots'),
  listHotspots: () => ipcRenderer.invoke('matrix:listHotspots'),
  generateContent: (payload) => ipcRenderer.invoke('matrix:generateContent', payload),
  schedulePublish: (payload) => ipcRenderer.invoke('matrix:schedulePublish', payload),
  listSchedules: () => ipcRenderer.invoke('matrix:listSchedules'),
  listTaskLogs: () => ipcRenderer.invoke('matrix:listTaskLogs'),
  listPublishMetrics: () => ipcRenderer.invoke('matrix:listPublishMetrics'),
});
