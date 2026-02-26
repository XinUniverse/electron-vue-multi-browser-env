import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class MatrixService {
  constructor({ baseDir, platforms = ['抖音', '小红书', '头条'] }) {
    this.platforms = platforms;
    this.dbFile = path.join(baseDir, 'matrix-store.db');
    this.db = new DatabaseSync(this.dbFile);
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
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS task_logs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
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
    };

    this.db.prepare(`
      INSERT INTO schedules (id, account_id, content_type, publish_at, status, created_at, started_at, completed_at, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        error_message as errorMessage
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

  runDueTasks() {
    const tasks = this.db.prepare(`
      SELECT id, account_id as accountId, content_type as contentType, publish_at as publishAt
      FROM schedules
      WHERE status = 'scheduled'
    `).all();

    const now = Date.now();
    for (const task of tasks) {
      const ts = new Date(task.publishAt).getTime();
      if (Number.isNaN(ts) || ts > now) continue;

      const startedAt = new Date().toISOString();
      this.db.prepare(`UPDATE schedules SET status = 'running', started_at = ? WHERE id = ?`).run(startedAt, task.id);

      const accountExists = this.db.prepare('SELECT id FROM accounts WHERE id = ? LIMIT 1').get(task.accountId);
      if (accountExists) {
        const completedAt = new Date().toISOString();
        this.db.prepare(`
          UPDATE schedules SET status = 'success', completed_at = ?, error_message = NULL WHERE id = ?
        `).run(completedAt, task.id);
        this.db.prepare(`
          INSERT INTO task_logs (id, task_id, level, message, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(randomUUID(), task.id, 'info', `任务执行成功：${task.contentType}`, completedAt);
      } else {
        const completedAt = new Date().toISOString();
        const err = '账号不存在或已删除';
        this.db.prepare(`
          UPDATE schedules SET status = 'failed', completed_at = ?, error_message = ? WHERE id = ?
        `).run(completedAt, err, task.id);
        this.db.prepare(`
          INSERT INTO task_logs (id, task_id, level, message, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(randomUUID(), task.id, 'error', err, completedAt);
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
