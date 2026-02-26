import {
  validateAddAccountPayload,
  validateGenerateContentPayload,
  validateNavigatePayload,
  validateSchedulePayload,
} from '../utils/validators.js';

function withGuard(handler) {
  return async (_, payload = {}) => {
    try {
      return await handler(payload);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'unknown error' };
    }
  };
}

export function registerIpcHandlers({ ipcMain, contextApi, matrixService }) {
  ipcMain.handle('contexts:create', withGuard(async ({ url }) => {
    const ctx = contextApi.createIsolatedContext(url);
    contextApi.attachContext(ctx.id);
    return { ok: true, context: ctx };
  }));

  ipcMain.handle('contexts:switch', withGuard(async ({ id }) => ({ ok: contextApi.attachContext(id) })));
  ipcMain.handle('contexts:close', withGuard(async ({ id }) => ({ ok: contextApi.closeContext(id) })));

  ipcMain.handle('contexts:navigate', withGuard(async (payload) => {
    validateNavigatePayload(payload);
    return { ok: contextApi.navigateContext(payload.id, payload.url) };
  }));

  ipcMain.handle('contexts:list', withGuard(async () => ({
    ok: true,
    contexts: contextApi.listContexts(),
    activeContextId: contextApi.getActiveContextId(),
  })));

  ipcMain.handle('matrix:getPlatforms', withGuard(async () => ({ ok: true, platforms: matrixService.getPlatforms() })));
  ipcMain.handle('matrix:listAccounts', withGuard(async () => ({ ok: true, accounts: matrixService.listAccounts() })));

  ipcMain.handle('matrix:addAccount', withGuard(async (payload) => {
    validateAddAccountPayload(payload);
    const account = matrixService.addAccount(payload);
    return { ok: true, account };
  }));

  ipcMain.handle('matrix:collectHotspots', withGuard(async () => ({ ok: true, hotspots: matrixService.collectHotspots() })));
  ipcMain.handle('matrix:listHotspots', withGuard(async () => ({ ok: true, hotspots: matrixService.listHotspots() })));

  ipcMain.handle('matrix:generateContent', withGuard(async (payload) => {
    validateGenerateContentPayload(payload);
    const content = matrixService.generateContent(payload);
    if (!content) return { ok: false, error: 'hotspot not found' };
    return { ok: true, content };
  }));

  ipcMain.handle('matrix:schedulePublish', withGuard(async (payload) => {
    validateSchedulePayload(payload);
    const task = matrixService.schedulePublish(payload);
    return { ok: true, task };
  }));

  ipcMain.handle('matrix:listSchedules', withGuard(async () => ({ ok: true, schedules: matrixService.listSchedules() })));
  ipcMain.handle('matrix:listTaskLogs', withGuard(async () => ({ ok: true, logs: matrixService.listTaskLogs() })));
  ipcMain.handle('matrix:listPublishMetrics', withGuard(async () => ({ ok: true, metrics: matrixService.listPublishMetrics() })));
}
