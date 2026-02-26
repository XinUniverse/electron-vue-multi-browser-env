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
    collectHotspots: () => [{ id: 'h1', platform: '抖音', topic: 't1', heat: 99 }],
    listHotspots: () => [{ id: 'h1', platform: '抖音', topic: 't1', heat: 99 }],
    generateContent: ({ hotspotId }) => (hotspotId === 'h1' ? { id: 'c1' } : null),
    schedulePublish: (p) => ({ id: 's1', ...p, status: 'scheduled' }),
    listSchedules: () => [{ id: 's1', status: 'scheduled' }],
    listTaskLogs: () => [{ id: 'l1', level: 'info', message: 'ok' }],
    listPublishMetrics: () => [{ id: 'm1', success: true, latencyMs: 30 }],
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
