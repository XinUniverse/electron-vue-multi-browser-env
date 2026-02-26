import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PlatformAdapterRegistry } from './platform-adapters.js';

export class MatrixService {
  constructor({ baseDir, platforms = ['抖音', '小红书', '头条'] }) {
    this.platforms = platforms;
    this.dbFile = path.join(baseDir, 'matrix-store.db');
    this.db = new DatabaseSync(this.dbFile);
    this.adapterRegistry = new PlatformAdapterRegistry();
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        nickname TEXT NOT NULL,
        ai_enabled INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hotspots (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        topic TEXT NOT NULL,
        heat INTEGER NOT NULL,
        collected_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        publish_at TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        remote_id TEXT
      );

      CREATE TABLE IF NOT EXISTS task_logs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    const scheduleColumns = this.db.prepare(`PRAGMA table_info(schedules)`).all();
    const hasRetryCount = scheduleColumns.some((col) => col.name === 'retry_count');
    const hasRemoteId = scheduleColumns.some((col) => col.name === 'remote_id');
    if (!hasRetryCount) this.db.exec('ALTER TABLE schedules ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0');
    if (!hasRemoteId) this.db.exec('ALTER TABLE schedules ADD COLUMN remote_id TEXT');
  }

  getPlatforms() {
    return this.platforms;
  }

  listAccounts() {
    return this.db.prepare(`
      SELECT
        id,
        platform,
        nickname,
        ai_enabled as aiEnabled,
        status,
        created_at as createdAt
      FROM accounts
      ORDER BY created_at DESC
    `).all().map((row) => ({ ...row, aiEnabled: Boolean(row.aiEnabled) }));
  }

  addAccount(payload) {
    const account = {
      id: randomUUID(),
      platform: payload.platform,
      nickname: payload.nickname,
      aiEnabled: Boolean(payload.aiEnabled),
      status: payload.status || 'active',
      createdAt: new Date().toISOString(),
    };

    this.db.prepare(`
      INSERT INTO accounts (id, platform, nickname, ai_enabled, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(account.id, account.platform, account.nickname, Number(account.aiEnabled), account.status, account.createdAt);

    return account;
  }

  collectHotspots() {
    this.db.exec('DELETE FROM hotspots');
    const now = new Date().toISOString();
    const list = [
      { id: randomUUID(), platform: '抖音', topic: 'AIGC短视频脚本自动化', heat: 97, collectedAt: now },
      { id: randomUUID(), platform: '小红书', topic: '春季穿搭爆款笔记', heat: 92, collectedAt: now },
      { id: randomUUID(), platform: '头条', topic: 'AI提效工具测评', heat: 89, collectedAt: now },
    ];

    const stmt = this.db.prepare(`
      INSERT INTO hotspots (id, platform, topic, heat, collected_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const h of list) {
      stmt.run(h.id, h.platform, h.topic, h.heat, h.collectedAt);
    }
    return list;
  }

  listHotspots() {
    return this.db.prepare(`
      SELECT id, platform, topic, heat, collected_at as collectedAt
      FROM hotspots
      ORDER BY heat DESC
    `).all();
  }

  generateContent({ hotspotId, type = '文章', tone = '专业' }) {
    const hotspot = this.db.prepare(`
      SELECT id, platform, topic, heat, collected_at as collectedAt
      FROM hotspots
      WHERE id = ?
      LIMIT 1
    `).get(hotspotId);

    if (!hotspot) return null;

    return {
      id: randomUUID(),
      hotspotId,
      type,
      tone,
      title: `【${hotspot.platform}】${hotspot.topic} - ${type}模板`,
      body: `基于热点「${hotspot.topic}」自动生成${type}内容，语气：${tone}。\n1. 开场吸引\n2. 核心观点\n3. 行动引导`,
      createdAt: new Date().toISOString(),
    };
  }

  schedulePublish(payload) {
    const task = {
      id: randomUUID(),
      accountId: payload.accountId,
      contentType: payload.contentType,
      publishAt: payload.publishAt,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      retryCount: 0,
      remoteId: null,
    };

    this.db.prepare(`
      INSERT INTO schedules (id, account_id, content_type, publish_at, status, created_at, started_at, completed_at, error_message, retry_count, remote_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id,
      task.accountId,
      task.contentType,
      task.publishAt,
      task.status,
      task.createdAt,
      task.startedAt,
      task.completedAt,
      task.errorMessage,
      task.retryCount,
      task.remoteId,
    );

    return task;
  }

  listSchedules() {
    return this.db.prepare(`
      SELECT
        id,
        account_id as accountId,
        content_type as contentType,
        publish_at as publishAt,
        status,
        created_at as createdAt,
        started_at as startedAt,
        completed_at as completedAt,
        error_message as errorMessage,
        retry_count as retryCount,
        remote_id as remoteId
      FROM schedules
      ORDER BY created_at DESC
    `).all();
  }

  listTaskLogs() {
    return this.db.prepare(`
      SELECT id, task_id as taskId, level, message, created_at as createdAt
      FROM task_logs
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
  }

  logTask(taskId, level, message) {
    const createdAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO task_logs (id, task_id, level, message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), taskId, level, message, createdAt);
  }

  async runDueTasks() {
    const tasks = this.db.prepare(`
      SELECT id, account_id as accountId, content_type as contentType, publish_at as publishAt, retry_count as retryCount
      FROM schedules
      WHERE status = 'scheduled' OR status = 'retrying'
    `).all();

    const now = Date.now();
    for (const task of tasks) {
      const ts = new Date(task.publishAt).getTime();
      if (Number.isNaN(ts) || ts > now) continue;

      const account = this.db.prepare('SELECT id, platform, nickname FROM accounts WHERE id = ? LIMIT 1').get(task.accountId);
      if (!account) {
        const completedAt = new Date().toISOString();
        const err = '账号不存在或已删除';
        this.db.prepare(`UPDATE schedules SET status = 'failed', completed_at = ?, error_message = ? WHERE id = ?`).run(completedAt, err, task.id);
        this.logTask(task.id, 'error', err);
        this.logTask(task.id, 'alert', `告警：发布失败（账号缺失），task=${task.id}`);
        continue;
      }

      const startedAt = new Date().toISOString();
      this.db.prepare(`UPDATE schedules SET status = 'running', started_at = ? WHERE id = ?`).run(startedAt, task.id);

      try {
        const adapter = this.adapterRegistry.getAdapter(account.platform);
        if (!adapter) throw new Error(`未找到平台适配器: ${account.platform}`);

        const result = await adapter.publish({
          account,
          contentType: task.contentType,
        });

        const completedAt = new Date().toISOString();
        this.db.prepare(`
          UPDATE schedules
          SET status = 'success', completed_at = ?, error_message = NULL, remote_id = ?
          WHERE id = ?
        `).run(completedAt, result.remoteId || null, task.id);

        this.logTask(task.id, 'info', `任务执行成功：${task.contentType} -> ${account.platform}`);
      } catch (error) {
        const retryCount = Number(task.retryCount || 0) + 1;
        const err = error instanceof Error ? error.message : '平台发布失败';

        if (retryCount <= 2) {
          this.db.prepare(`
            UPDATE schedules
            SET status = 'retrying', retry_count = ?, error_message = ?
            WHERE id = ?
          `).run(retryCount, err, task.id);
          this.logTask(task.id, 'warn', `发布失败，准备第 ${retryCount} 次重试：${err}`);
        } else {
          const completedAt = new Date().toISOString();
          this.db.prepare(`
            UPDATE schedules
            SET status = 'failed', completed_at = ?, retry_count = ?, error_message = ?
            WHERE id = ?
          `).run(completedAt, retryCount, err, task.id);
          this.logTask(task.id, 'error', `发布失败（超过重试次数）：${err}`);
          this.logTask(task.id, 'alert', `告警：任务最终失败，task=${task.id}，platform=${account.platform}`);
        }
      }
    }

    this.db.exec(`
      DELETE FROM task_logs
      WHERE id NOT IN (
        SELECT id FROM task_logs ORDER BY created_at DESC LIMIT 100
      )
    `);
  }
}
