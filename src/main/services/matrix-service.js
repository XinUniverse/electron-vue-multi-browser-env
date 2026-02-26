import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { PlatformAdapterRegistry } from './platform-adapters.js';
import { AlertReporter } from './alert-reporter.js';

export class MatrixService {
  constructor({ baseDir, platforms = ['抖音', '小红书', '头条'], alertReporter } = {}) {
    this.platforms = platforms;
    this.dbFile = path.join(baseDir, 'matrix-store.db');
    try {
      fs.mkdirSync(path.dirname(this.dbFile), { recursive: true });
    } catch (err) {
      console.error('Failed to create directory:', err);
    }
    this.db = new Database(this.dbFile);
    this.adapterRegistry = new PlatformAdapterRegistry(this.buildPlatformConfig());
    this.alertReporter = alertReporter || new AlertReporter({
      webhookUrl: process.env.ALERT_WEBHOOK_URL || '',
      wecomWebhookUrl: process.env.WECOM_WEBHOOK_URL || '',
      feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL || '',
    });
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

      CREATE TABLE IF NOT EXISTS content_assets (
        id TEXT PRIMARY KEY,
        hotspot_id TEXT NOT NULL,
        type TEXT NOT NULL,
        tone TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        content_asset_id TEXT,
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

      CREATE TABLE IF NOT EXISTS publish_metrics (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        success INTEGER NOT NULL,
        error_code TEXT,
        latency_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    const scheduleColumns = this.db.prepare(`PRAGMA table_info(schedules)`).all();
    const hasRetryCount = scheduleColumns.some((col) => col.name === 'retry_count');
    const hasRemoteId = scheduleColumns.some((col) => col.name === 'remote_id');
    const hasContentAssetId = scheduleColumns.some((col) => col.name === 'content_asset_id');
    if (!hasRetryCount) this.db.exec('ALTER TABLE schedules ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0');
    if (!hasRemoteId) this.db.exec('ALTER TABLE schedules ADD COLUMN remote_id TEXT');
    if (!hasContentAssetId) this.db.exec('ALTER TABLE schedules ADD COLUMN content_asset_id TEXT');
  }

  getPlatforms() {
    return this.platforms;
  }

  buildPlatformConfig() {
    const parse = (prefix, defaults = {}) => ({
      mode: process.env[`${prefix}_MODE`] || defaults.mode || 'mock',
      publishUrl: process.env[`${prefix}_PUBLISH_URL`] || defaults.publishUrl || '',
      appId: process.env[`${prefix}_APP_ID`] || defaults.appId || 'demo-app',
      appSecret: process.env[`${prefix}_APP_SECRET`] || defaults.appSecret || 'demo-secret',
      timeoutMs: Number(process.env[`${prefix}_TIMEOUT_MS`] || defaults.timeoutMs || 8000),
    });
    return {
      抖音: parse('DY', { mode: 'mock' }),
      小红书: parse('XHS', { mode: 'mock' }),
      头条: parse('TT', { mode: 'mock' }),
    };
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

  updateAccountStatus({ id, status }) {
    this.db.prepare(`
      UPDATE accounts
      SET status = ?
      WHERE id = ?
    `).run(status, id);

    return this.db.prepare(`
      SELECT id, platform, nickname, ai_enabled as aiEnabled, status, created_at as createdAt
      FROM accounts WHERE id = ? LIMIT 1
    `).get(id);
  }

  deleteAccount({ id }) {
    this.db.prepare(`DELETE FROM accounts WHERE id = ?`).run(id);
    return { id };
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



  saveGeneratedContent(content) {
    this.db.prepare(`
      INSERT INTO content_assets (id, hotspot_id, type, tone, title, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(content.id, content.hotspotId, content.type, content.tone, content.title, content.body, content.createdAt);
    return content;
  }

  listContentAssets(limit = 50) {
    return this.db.prepare(`
      SELECT id, hotspot_id as hotspotId, type, tone, title, body, created_at as createdAt
      FROM content_assets
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }

  deleteContentAsset({ id }) {
    this.db.prepare('DELETE FROM content_assets WHERE id = ?').run(id);
    return { id };
  }
  schedulePublish(payload) {
    const task = {
      id: randomUUID(),
      accountId: payload.accountId,
      contentType: payload.contentType,
      contentAssetId: payload.contentAssetId || null,
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
      INSERT INTO schedules (id, account_id, content_type, content_asset_id, publish_at, status, created_at, started_at, completed_at, error_message, retry_count, remote_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id,
      task.accountId,
      task.contentType,
      task.contentAssetId,
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

  cancelSchedule({ id }) {
    this.db.prepare(`
      UPDATE schedules
      SET status = 'cancelled', completed_at = ?
      WHERE id = ? AND (status = 'scheduled' OR status = 'retrying')
    `).run(new Date().toISOString(), id);
    return { id };
  }

  retrySchedule({ id }) {
    this.db.prepare(`
      UPDATE schedules
      SET status = 'scheduled', retry_count = 0, error_message = NULL, completed_at = NULL
      WHERE id = ?
    `).run(id);
    return { id };
  }

  executeScheduleNow({ id }) {
    this.db.prepare(`
      UPDATE schedules
      SET status = 'scheduled', publish_at = ?, retry_count = 0, error_message = NULL, completed_at = NULL
      WHERE id = ?
    `).run(new Date(Date.now() - 1000).toISOString(), id);
    return { id };
  }

  clearTaskLogs() {
    this.db.prepare('DELETE FROM task_logs').run();
    return { ok: true };
  }

  clearPublishMetrics() {
    this.db.prepare('DELETE FROM publish_metrics').run();
    return { ok: true };
  }

  listSchedules() {
    return this.db.prepare(`
      SELECT
        id,
        account_id as accountId,
        content_type as contentType,
        content_asset_id as contentAssetId,
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

  listSchedulesByStatus({ status = 'all' } = {}) {
    if (status === 'all') return this.listSchedules();
    return this.db.prepare(`
      SELECT
        id,
        account_id as accountId,
        content_type as contentType,
        content_asset_id as contentAssetId,
        publish_at as publishAt,
        status,
        created_at as createdAt,
        started_at as startedAt,
        completed_at as completedAt,
        error_message as errorMessage,
        retry_count as retryCount,
        remote_id as remoteId
      FROM schedules
      WHERE status = ?
      ORDER BY created_at DESC
    `).all(status);
  }

  listTaskLogs(limit = 100) {
    return this.db.prepare(`
      SELECT id, task_id as taskId, level, message, created_at as createdAt
      FROM task_logs
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }

  logTask(taskId, level, message) {
    const createdAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO task_logs (id, task_id, level, message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), taskId, level, message, createdAt);
  }

  async sendAlert(event, details) {
    try {
      await this.alertReporter.notify({
        event,
        details,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown alert error';
      this.logTask(details.taskId, 'warn', `告警上报失败：${msg}`);
    }
  }


  listPublishMetrics(limit = 50) {
    return this.db.prepare(`
      SELECT id, task_id as taskId, platform, success, error_code as errorCode, latency_ms as latencyMs, created_at as createdAt
      FROM publish_metrics
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit).map((row) => ({ ...row, success: Boolean(row.success) }));
  }



  getRecentFailures(limit = 20) {
    return this.db.prepare(`
      SELECT id, account_id as accountId, content_type as contentType, error_message as errorMessage, completed_at as completedAt, retry_count as retryCount
      FROM schedules
      WHERE status = 'failed'
      ORDER BY completed_at DESC
      LIMIT ?
    `).all(limit);
  }
  getDashboardStats() {
    const accountCount = this.db.prepare('SELECT COUNT(1) as c FROM accounts').get().c;
    const activeAccountCount = this.db.prepare("SELECT COUNT(1) as c FROM accounts WHERE status = 'active'").get().c;
    const scheduleCount = this.db.prepare('SELECT COUNT(1) as c FROM schedules').get().c;
    const pendingCount = this.db.prepare("SELECT COUNT(1) as c FROM schedules WHERE status IN ('scheduled','retrying','running')").get().c;
    const successCount = this.db.prepare("SELECT COUNT(1) as c FROM schedules WHERE status = 'success'").get().c;
    const failedCount = this.db.prepare("SELECT COUNT(1) as c FROM schedules WHERE status = 'failed'").get().c;
    return { accountCount, activeAccountCount, scheduleCount, pendingCount, successCount, failedCount };
  }

  recordPublishMetric({ taskId, platform, success, errorCode = null, latencyMs }) {
    this.db.prepare(`
      INSERT INTO publish_metrics (id, task_id, platform, success, error_code, latency_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), taskId, platform, Number(success), errorCode, latencyMs, new Date().toISOString());
  }



  exportSnapshot() {
    return {
      exportedAt: new Date().toISOString(),
      accounts: this.listAccounts(),
      hotspots: this.listHotspots(),
      contentAssets: this.listContentAssets(500),
      schedules: this.listSchedules(),
    };
  }

  importSnapshot({ snapshot, mode = 'merge' }) {
    if (mode === 'replace') {
      this.db.exec('DELETE FROM schedules');
      this.db.exec('DELETE FROM content_assets');
      this.db.exec('DELETE FROM hotspots');
      this.db.exec('DELETE FROM accounts');
      this.db.exec('DELETE FROM task_logs');
      this.db.exec('DELETE FROM publish_metrics');
    }

    const insertAccount = this.db.prepare(`
      INSERT OR IGNORE INTO accounts (id, platform, nickname, ai_enabled, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertHotspot = this.db.prepare(`
      INSERT OR IGNORE INTO hotspots (id, platform, topic, heat, collected_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertAsset = this.db.prepare(`
      INSERT OR IGNORE INTO content_assets (id, hotspot_id, type, tone, title, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSchedule = this.db.prepare(`
      INSERT OR IGNORE INTO schedules (id, account_id, content_type, content_asset_id, publish_at, status, created_at, started_at, completed_at, error_message, retry_count, remote_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
    const hotspots = Array.isArray(snapshot.hotspots) ? snapshot.hotspots : [];
    const assets = Array.isArray(snapshot.contentAssets) ? snapshot.contentAssets : [];
    const schedules = Array.isArray(snapshot.schedules) ? snapshot.schedules : [];

    for (const a of accounts) {
      insertAccount.run(a.id, a.platform, a.nickname, Number(Boolean(a.aiEnabled)), a.status || 'active', a.createdAt || new Date().toISOString());
    }
    for (const h of hotspots) {
      insertHotspot.run(h.id, h.platform, h.topic, Number(h.heat || 0), h.collectedAt || new Date().toISOString());
    }
    for (const c of assets) {
      insertAsset.run(c.id, c.hotspotId, c.type, c.tone, c.title, c.body, c.createdAt || new Date().toISOString());
    }
    for (const t of schedules) {
      insertSchedule.run(
        t.id,
        t.accountId,
        t.contentType,
        t.contentAssetId || null,
        t.publishAt,
        t.status || 'scheduled',
        t.createdAt || new Date().toISOString(),
        t.startedAt || null,
        t.completedAt || null,
        t.errorMessage || null,
        Number(t.retryCount || 0),
        t.remoteId || null,
      );
    }

    return {
      imported: {
        accounts: accounts.length,
        hotspots: hotspots.length,
        contentAssets: assets.length,
        schedules: schedules.length,
      },
      mode,
    };
  }
  async runDueTasks() {
    const tasks = this.db.prepare(`
      SELECT id, account_id as accountId, content_type as contentType, content_asset_id as contentAssetId, publish_at as publishAt, retry_count as retryCount
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
        await this.sendAlert('publish_failed_missing_account', { taskId: task.id, accountId: task.accountId });
        continue;
      }

      const startedAt = new Date().toISOString();
      this.db.prepare(`UPDATE schedules SET status = 'running', started_at = ? WHERE id = ?`).run(startedAt, task.id);

      const started = Date.now();
      try {
        const adapter = this.adapterRegistry.getAdapter(account.platform);
        if (!adapter) throw new Error(`未找到平台适配器: ${account.platform}`);

        const contentAsset = task.contentAssetId ? this.db.prepare('SELECT id, title, body FROM content_assets WHERE id = ? LIMIT 1').get(task.contentAssetId) : null;
        const result = await adapter.publish({
          account,
          contentType: task.contentType,
          contentAsset,
        });

        const completedAt = new Date().toISOString();
        this.db.prepare(`
          UPDATE schedules
          SET status = 'success', completed_at = ?, error_message = NULL, remote_id = ?
          WHERE id = ?
        `).run(completedAt, result.remoteId || null, task.id);

        this.logTask(task.id, 'info', `任务执行成功：${task.contentType} -> ${account.platform}`);
        this.recordPublishMetric({ taskId: task.id, platform: account.platform, success: true, latencyMs: Date.now() - started });
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
          this.recordPublishMetric({ taskId: task.id, platform: account.platform, success: false, errorCode: error.code || 'RETRY', latencyMs: Date.now() - started });
        } else {
          const completedAt = new Date().toISOString();
          this.db.prepare(`
            UPDATE schedules
            SET status = 'failed', completed_at = ?, retry_count = ?, error_message = ?
            WHERE id = ?
          `).run(completedAt, retryCount, err, task.id);
          this.logTask(task.id, 'error', `发布失败（超过重试次数）：${err}`);
          this.recordPublishMetric({ taskId: task.id, platform: account.platform, success: false, errorCode: error.code || 'FAILED', latencyMs: Date.now() - started });
          this.logTask(task.id, 'alert', `告警：任务最终失败，task=${task.id}，platform=${account.platform}`);
          await this.sendAlert('publish_failed_final', { taskId: task.id, platform: account.platform, errorCode: error.code || 'FAILED' });
        }
      }
    }

    this.db.exec(`
      DELETE FROM task_logs
      WHERE id NOT IN (
        SELECT id FROM task_logs ORDER BY created_at DESC LIMIT 100
      )
    `);

    this.db.exec(`
      DELETE FROM publish_metrics
      WHERE id NOT IN (
        SELECT id FROM publish_metrics ORDER BY created_at DESC LIMIT 500
      )
    `);
  }
}
