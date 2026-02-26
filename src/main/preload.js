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
  updateAccountStatus: (payload) => ipcRenderer.invoke('matrix:updateAccountStatus', payload),
  deleteAccount: (payload) => ipcRenderer.invoke('matrix:deleteAccount', payload),
  collectHotspots: () => ipcRenderer.invoke('matrix:collectHotspots'),
  listHotspots: () => ipcRenderer.invoke('matrix:listHotspots'),
  generateContent: (payload) => ipcRenderer.invoke('matrix:generateContent', payload),
  saveGeneratedContent: (payload) => ipcRenderer.invoke('matrix:saveGeneratedContent', payload),
  listContentAssets: (payload) => ipcRenderer.invoke('matrix:listContentAssets', payload || {}),
  deleteContentAsset: (payload) => ipcRenderer.invoke('matrix:deleteContentAsset', payload),
  schedulePublish: (payload) => ipcRenderer.invoke('matrix:schedulePublish', payload),
  cancelSchedule: (payload) => ipcRenderer.invoke('matrix:cancelSchedule', payload),
  retrySchedule: (payload) => ipcRenderer.invoke('matrix:retrySchedule', payload),
  executeScheduleNow: (payload) => ipcRenderer.invoke('matrix:executeScheduleNow', payload),
  listSchedules: (payload) => ipcRenderer.invoke('matrix:listSchedules', payload || {}),
  listTaskLogs: (payload) => ipcRenderer.invoke('matrix:listTaskLogs', payload || {}),
  clearTaskLogs: () => ipcRenderer.invoke('matrix:clearTaskLogs'),
  listPublishMetrics: (payload) => ipcRenderer.invoke('matrix:listPublishMetrics', payload || {}),
  clearPublishMetrics: () => ipcRenderer.invoke('matrix:clearPublishMetrics'),
  getDashboardStats: () => ipcRenderer.invoke('matrix:getDashboardStats'),
  getRecentFailures: (payload) => ipcRenderer.invoke('matrix:getRecentFailures', payload || {}),
  exportSnapshot: () => ipcRenderer.invoke('matrix:exportSnapshot'),
  importSnapshot: (payload) => ipcRenderer.invoke('matrix:importSnapshot', payload),
});
