import {
  validateAddAccountPayload,
  validateDeleteAccountPayload,
  validateContentAssetPayload,
  validateDeleteContentAssetPayload,
  validateGenerateContentPayload,
  validateImportSnapshotPayload,
  validateNavigatePayload,
  validateListQueryPayload,
  validateSchedulePayload,
  validateTaskActionPayload,
  validateUpdateAccountPayload,
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

  ipcMain.handle('matrix:updateAccountStatus', withGuard(async (payload) => {
    validateUpdateAccountPayload(payload);
    const account = matrixService.updateAccountStatus(payload);
    return { ok: true, account };
  }));

  ipcMain.handle('matrix:deleteAccount', withGuard(async (payload) => {
    validateDeleteAccountPayload(payload);
    return { ok: true, account: matrixService.deleteAccount(payload) };
  }));

  ipcMain.handle('matrix:collectHotspots', withGuard(async () => ({ ok: true, hotspots: matrixService.collectHotspots() })));
  ipcMain.handle('matrix:listHotspots', withGuard(async () => ({ ok: true, hotspots: matrixService.listHotspots() })));

  ipcMain.handle('matrix:generateContent', withGuard(async (payload) => {
    validateGenerateContentPayload(payload);
    const content = matrixService.generateContent(payload);
    if (!content) return { ok: false, error: 'hotspot not found' };
    return { ok: true, content };
  }));


  ipcMain.handle('matrix:saveGeneratedContent', withGuard(async (payload) => {
    validateContentAssetPayload(payload);
    return { ok: true, asset: matrixService.saveGeneratedContent(payload) };
  }));

  ipcMain.handle('matrix:listContentAssets', withGuard(async (payload = {}) => {
    validateListQueryPayload(payload);
    return { ok: true, assets: matrixService.listContentAssets(payload.limit || 50) };
  }));

  ipcMain.handle('matrix:deleteContentAsset', withGuard(async (payload) => {
    validateDeleteContentAssetPayload(payload);
    return { ok: true, asset: matrixService.deleteContentAsset(payload) };
  }));

  ipcMain.handle('matrix:schedulePublish', withGuard(async (payload) => {
    validateSchedulePayload(payload);
    const task = matrixService.schedulePublish(payload);
    return { ok: true, task };
  }));

  ipcMain.handle('matrix:cancelSchedule', withGuard(async (payload) => {
    validateTaskActionPayload(payload);
    return { ok: true, task: matrixService.cancelSchedule(payload) };
  }));

  ipcMain.handle('matrix:retrySchedule', withGuard(async (payload) => {
    validateTaskActionPayload(payload);
    return { ok: true, task: matrixService.retrySchedule(payload) };
  }));

  ipcMain.handle('matrix:executeScheduleNow', withGuard(async (payload) => {
    validateTaskActionPayload(payload);
    return { ok: true, task: matrixService.executeScheduleNow(payload) };
  }));

  ipcMain.handle('matrix:listSchedules', withGuard(async ({ status = 'all' }) => ({ ok: true, schedules: matrixService.listSchedulesByStatus({ status }) })));

  ipcMain.handle('matrix:listTaskLogs', withGuard(async (payload = {}) => {
    validateListQueryPayload(payload);
    return { ok: true, logs: matrixService.listTaskLogs(payload.limit || 100) };
  }));
  ipcMain.handle('matrix:clearTaskLogs', withGuard(async () => ({ ok: true, result: matrixService.clearTaskLogs() })));
  ipcMain.handle('matrix:listPublishMetrics', withGuard(async (payload = {}) => {
    validateListQueryPayload(payload);
    return { ok: true, metrics: matrixService.listPublishMetrics(payload.limit || 50) };
  }));
  ipcMain.handle('matrix:clearPublishMetrics', withGuard(async () => ({ ok: true, result: matrixService.clearPublishMetrics() })));
  ipcMain.handle('matrix:getDashboardStats', withGuard(async () => ({ ok: true, stats: matrixService.getDashboardStats() })));
  ipcMain.handle('matrix:exportSnapshot', withGuard(async () => ({ ok: true, snapshot: matrixService.exportSnapshot() })));
  ipcMain.handle('matrix:importSnapshot', withGuard(async (payload) => {
    validateImportSnapshotPayload(payload);
    return { ok: true, result: matrixService.importSnapshot(payload) };
  }));
  ipcMain.handle('matrix:getRecentFailures', withGuard(async (payload = {}) => {
    validateListQueryPayload(payload);
    return { ok: true, failures: matrixService.getRecentFailures(payload.limit || 20) };
  }));
}
