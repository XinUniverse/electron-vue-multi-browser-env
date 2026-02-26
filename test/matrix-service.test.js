import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MatrixService } from '../src/main/services/matrix-service.js';

function createTempService({ alertReporter } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-service-'));
  return { tmp, service: new MatrixService({ baseDir: tmp, alertReporter }) };
}

test('matrix service adds and lists account', () => {
  const { service } = createTempService();
  const account = service.addAccount({ platform: '抖音', nickname: '账号A', aiEnabled: true });
  const all = service.listAccounts();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, account.id);
  assert.equal(all[0].aiEnabled, true);
});

test('hotspots can be collected and used for content generation', () => {
  const { service } = createTempService();
  const hotspots = service.collectHotspots();
  assert.equal(hotspots.length, 3);
  const content = service.generateContent({ hotspotId: hotspots[0].id, type: '视频脚本', tone: '活泼' });
  assert.ok(content);
  assert.match(content.title, /视频脚本/);
});

test('scheduler transitions due tasks and records success metrics', async () => {
  const { service } = createTempService();
  const account = service.addAccount({ platform: '头条', nickname: '账号B', aiEnabled: false });

  const dueTime = new Date(Date.now() - 2000).toISOString();
  service.schedulePublish({ accountId: account.id, contentType: '文章', publishAt: dueTime });
  await service.runDueTasks();

  const schedules = service.listSchedules();
  assert.equal(schedules.length, 1);
  assert.equal(schedules[0].status, 'success');
  assert.match(schedules[0].remoteId, /^tt-/);

  const metrics = service.listPublishMetrics();
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].success, true);
});

test('scheduler failed with mapped error code and alert after retries', async () => {
  const alertCalls = [];
  const reporter = { notify: async (payload) => { alertCalls.push(payload); return { ok: true }; } };
  const { service } = createTempService({ alertReporter: reporter });
  const account = service.addAccount({ platform: '抖音', nickname: '账号C', aiEnabled: false });
  const dueTime = new Date(Date.now() - 2000).toISOString();
  service.schedulePublish({ accountId: account.id, contentType: '模拟鉴权失败', publishAt: dueTime });

  await service.runDueTasks();
  await service.runDueTasks();
  await service.runDueTasks();

  const schedules = service.listSchedules();
  assert.equal(schedules[0].status, 'failed');
  assert.equal(schedules[0].retryCount, 3);

  const metrics = service.listPublishMetrics();
  assert.ok(metrics.some((m) => m.errorCode === 'AUTH_FAILED'));

  const logs = service.listTaskLogs();
  assert.ok(logs.some((log) => log.level === 'alert'));
  assert.equal(alertCalls.length, 1);
  assert.equal(alertCalls[0].event, 'publish_failed_final');
});


test('account status update and delete work', () => {
  const { service } = createTempService();
  const account = service.addAccount({ platform: '小红书', nickname: '账号D', aiEnabled: true });
  const updated = service.updateAccountStatus({ id: account.id, status: 'disabled' });
  assert.equal(updated.status, 'disabled');
  service.deleteAccount({ id: account.id });
  const list = service.listAccounts();
  assert.equal(list.length, 0);
});

test('schedule can be cancelled and manually retried', async () => {
  const { service } = createTempService();
  const account = service.addAccount({ platform: '头条', nickname: '账号E', aiEnabled: false });
  const dueTime = new Date(Date.now() + 3600_000).toISOString();
  const task = service.schedulePublish({ accountId: account.id, contentType: '文章', publishAt: dueTime });
  service.cancelSchedule({ id: task.id });
  let schedules = service.listSchedules();
  assert.equal(schedules[0].status, 'cancelled');

  service.retrySchedule({ id: task.id });
  schedules = service.listSchedules();
  assert.equal(schedules[0].status, 'scheduled');
});

test('dashboard stats returns aggregate values', () => {
  const { service } = createTempService();
  service.addAccount({ platform: '抖音', nickname: '账号F', aiEnabled: true });
  const stats = service.getDashboardStats();
  assert.equal(stats.accountCount, 1);
  assert.equal(stats.activeAccountCount, 1);
});


test('listSchedulesByStatus and clear methods work', async () => {
  const { service } = createTempService();
  const account = service.addAccount({ platform: '头条', nickname: '账号G', aiEnabled: true });
  const dueTime = new Date(Date.now() + 3600_000).toISOString();
  const task = service.schedulePublish({ accountId: account.id, contentType: '文章', publishAt: dueTime });

  let filtered = service.listSchedulesByStatus({ status: 'scheduled' });
  assert.equal(filtered.length, 1);
  service.executeScheduleNow({ id: task.id });
  await service.runDueTasks();
  filtered = service.listSchedulesByStatus({ status: 'success' });
  assert.equal(filtered.length, 1);

  service.clearTaskLogs();
  service.clearPublishMetrics();
  assert.equal(service.listTaskLogs().length, 0);
  assert.equal(service.listPublishMetrics().length, 0);
});


test('recent failures query returns failed tasks', async () => {
  const { service } = createTempService();
  const account = service.addAccount({ platform: '抖音', nickname: '账号H', aiEnabled: true });
  const dueTime = new Date(Date.now() - 2000).toISOString();
  service.schedulePublish({ accountId: account.id, contentType: '模拟鉴权失败', publishAt: dueTime });
  await service.runDueTasks();
  await service.runDueTasks();
  await service.runDueTasks();
  const failures = service.getRecentFailures(5);
  assert.ok(failures.length >= 1);
  assert.equal(failures[0].contentType, '模拟鉴权失败');
});


test('generated content asset can be saved/listed/deleted', () => {
  const { service } = createTempService();
  const hotspots = service.collectHotspots();
  const content = service.generateContent({ hotspotId: hotspots[0].id, type: '文章', tone: '专业' });
  service.saveGeneratedContent(content);
  let assets = service.listContentAssets(10);
  assert.equal(assets.length, 1);
  assert.equal(assets[0].id, content.id);
  service.deleteContentAsset({ id: content.id });
  assets = service.listContentAssets(10);
  assert.equal(assets.length, 0);
});


test('snapshot export/import supports merge and replace', () => {
  const { service } = createTempService();
  const account = service.addAccount({ platform: '抖音', nickname: '账号I', aiEnabled: true });
  const snap = service.exportSnapshot();
  assert.equal(snap.accounts.length, 1);

  service.deleteAccount({ id: account.id });
  assert.equal(service.listAccounts().length, 0);

  service.importSnapshot({ snapshot: snap, mode: 'merge' });
  assert.equal(service.listAccounts().length, 1);

  service.importSnapshot({ snapshot: { accounts: [], hotspots: [], contentAssets: [], schedules: [] }, mode: 'replace' });
  assert.equal(service.listAccounts().length, 0);
});
