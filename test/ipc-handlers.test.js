import test from 'node:test';
import assert from 'node:assert/strict';
import { registerIpcHandlers } from '../src/main/ipc/register-handlers.js';

function createFakeIpcMain() {
  const handlers = new Map();
  return {
    handle: (name, fn) => handlers.set(name, fn),
    invoke: async (name, payload) => handlers.get(name)({}, payload),
  };
}

function createStubs() {
  const contexts = new Map();
  let activeId = null;
  const contextApi = {
    createIsolatedContext: (url) => {
      const ctx = { id: `ctx-${contexts.size + 1}`, partition: `persist:ctx-${contexts.size + 1}`, url };
      contexts.set(ctx.id, { ...ctx, title: 'tab', currentUrl: url || 'https://example.com', isLoading: false });
      return ctx;
    },
    attachContext: (id) => {
      if (!contexts.has(id)) return false;
      activeId = id;
      return true;
    },
    closeContext: (id) => contexts.delete(id),
    navigateContext: (id, url) => {
      const c = contexts.get(id);
      if (!c) return false;
      c.currentUrl = url;
      return true;
    },
    listContexts: () => [...contexts.values()],
    getActiveContextId: () => activeId,
  };

  const matrixService = {
    getPlatforms: () => ['抖音', '小红书', '头条'],
    listAccounts: () => [],
    addAccount: (p) => ({ id: 'a1', ...p }),
    updateAccountStatus: (p) => ({ ...p }),
    deleteAccount: (p) => ({ ...p }),
    collectHotspots: () => [{ id: 'h1', platform: '抖音', topic: 't1', heat: 99 }],
    listHotspots: () => [{ id: 'h1', platform: '抖音', topic: 't1', heat: 99 }],
    generateContent: ({ hotspotId }) => (hotspotId === 'h1' ? { id: 'c1', title: 't', body: 'b', type: '文章', tone: '专业', hotspotId: 'h1', createdAt: new Date().toISOString() } : null),
    saveGeneratedContent: (p) => ({ ...p }),
    listContentAssets: () => [{ id: 'ca1', title: 'asset1' }],
    deleteContentAsset: (p) => ({ ...p }),
    schedulePublish: (p) => ({ id: 's1', ...p, status: 'scheduled' }),
    cancelSchedule: (p) => ({ ...p }),
    retrySchedule: (p) => ({ ...p }),
    executeScheduleNow: (p) => ({ ...p }),
    listSchedules: () => [{ id: 's1', status: 'scheduled' }],
    listTaskLogs: () => [{ id: 'l1', level: 'info', message: 'ok' }],
    clearTaskLogs: () => ({ ok: true }),
    listPublishMetrics: () => [{ id: 'm1', success: true, latencyMs: 30 }],
    clearPublishMetrics: () => ({ ok: true }),
    getDashboardStats: () => ({ accountCount: 1, successCount: 0 }),
    getRecentFailures: () => [{ id: 'f1', errorMessage: 'x' }],
    exportSnapshot: () => ({ accounts: [] }),
    importSnapshot: () => ({ imported: { accounts: 0 } }),
  };

  return { contextApi, matrixService };
}

test('ipc handlers register and success path works', async () => {
  const ipcMain = createFakeIpcMain();
  const deps = createStubs();
  registerIpcHandlers({ ipcMain, ...deps });

  const created = await ipcMain.invoke('contexts:create', { url: 'https://example.com' });
  assert.equal(created.ok, true);
  assert.equal(created.context.id, 'ctx-1');

  const list = await ipcMain.invoke('contexts:list', {});
  assert.equal(list.ok, true);
  assert.equal(list.contexts.length, 1);

  const addAccount = await ipcMain.invoke('matrix:addAccount', { platform: '抖音', nickname: 'a' });
  assert.equal(addAccount.ok, true);
  assert.equal(addAccount.account.id, 'a1');

  const metrics = await ipcMain.invoke('matrix:listPublishMetrics', {});
  assert.equal(metrics.ok, true);
  assert.equal(metrics.metrics.length, 1);

  const assets = await ipcMain.invoke('matrix:listContentAssets', { limit: 20 });
  assert.equal(assets.ok, true);
  assert.equal(assets.assets.length, 1);

  const stats = await ipcMain.invoke('matrix:getDashboardStats', {});
  assert.equal(stats.ok, true);
  assert.equal(stats.stats.accountCount, 1);
  const failures = await ipcMain.invoke('matrix:getRecentFailures', { limit: 10 });
  assert.equal(failures.ok, true);
  assert.equal(failures.failures.length, 1);
  const snap = await ipcMain.invoke('matrix:exportSnapshot', {});
  assert.equal(snap.ok, true);
  const imp = await ipcMain.invoke('matrix:importSnapshot', { snapshot: { accounts: [] }, mode: 'merge' });
  assert.equal(imp.ok, true);
});

test('ipc handlers account/schedule action handlers', async () => {
  const ipcMain = createFakeIpcMain();
  const deps = createStubs();
  registerIpcHandlers({ ipcMain, ...deps });

  const up = await ipcMain.invoke('matrix:updateAccountStatus', { id: 'a1', status: 'disabled' });
  assert.equal(up.ok, true);

  const del = await ipcMain.invoke('matrix:deleteAccount', { id: 'a1' });
  assert.equal(del.ok, true);

  const cancel = await ipcMain.invoke('matrix:cancelSchedule', { id: 's1' });
  assert.equal(cancel.ok, true);

  const retry = await ipcMain.invoke('matrix:retrySchedule', { id: 's1' });
  assert.equal(retry.ok, true);

  const runNow = await ipcMain.invoke('matrix:executeScheduleNow', { id: 's1' });
  assert.equal(runNow.ok, true);
  const saveAsset = await ipcMain.invoke('matrix:saveGeneratedContent', { id: 'ca1', hotspotId: 'h1', type: '文章', tone: '专业', title: 't', body: 'b', createdAt: new Date().toISOString() });
  assert.equal(saveAsset.ok, true);
  const delAsset = await ipcMain.invoke('matrix:deleteContentAsset', { id: 'ca1' });
  assert.equal(delAsset.ok, true);
  const clearLogs = await ipcMain.invoke('matrix:clearTaskLogs', {});
  assert.equal(clearLogs.ok, true);
  const clearMetrics = await ipcMain.invoke('matrix:clearPublishMetrics', {});
  assert.equal(clearMetrics.ok, true);
});

test('ipc handlers return guarded errors for bad payload', async () => {
  const ipcMain = createFakeIpcMain();
  const deps = createStubs();
  registerIpcHandlers({ ipcMain, ...deps });

  const badNavigate = await ipcMain.invoke('contexts:navigate', { id: 'ctx-1' });
  assert.equal(badNavigate.ok, false);
  assert.match(badNavigate.error, /url must be a string/);

  const badSchedule = await ipcMain.invoke('matrix:schedulePublish', { accountId: 'a1' });
  assert.equal(badSchedule.ok, false);
  assert.match(badSchedule.error, /contentType must be a string/);
});

test('ipc generateContent returns business error when hotspot missing', async () => {
  const ipcMain = createFakeIpcMain();
  const deps = createStubs();
  registerIpcHandlers({ ipcMain, ...deps });

  const result = await ipcMain.invoke('matrix:generateContent', { hotspotId: 'nope' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'hotspot not found');
});
