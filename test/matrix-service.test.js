import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MatrixService } from '../src/main/services/matrix-service.js';

function createTempService() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-service-'));
  return { tmp, service: new MatrixService({ baseDir: tmp }) };
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
  const { service } = createTempService();
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
});
