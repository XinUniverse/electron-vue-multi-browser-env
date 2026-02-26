import { randomUUID } from 'node:crypto';
import { PlatformAdapterRegistry } from './platform-adapters.js';
import { AlertReporter } from './alert-reporter.js';

export class MatrixService {
  constructor({ platforms = ['抖音', '小红书', '头条'], alertReporter } = {}) {
    this.platforms = platforms;
    this.adapterRegistry = new PlatformAdapterRegistry();
    this.alertReporter = alertReporter || new AlertReporter({
      webhookUrl: process.env.ALERT_WEBHOOK_URL || '',
      wecomWebhookUrl: process.env.WECOM_WEBHOOK_URL || '',
      feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL || '',
    });

    this.accounts = [];
    this.hotspots = [];
    this.contentAssets = [];
    this.schedules = [];
    this.taskLogs = [];
    this.publishMetrics = [];
  }

  getPlatforms() {
    return this.platforms;
  }

  listAccounts() {
    return [...this.accounts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  updateAccountStatus({ id, status }) {
    const account = this.accounts.find((item) => item.id === id);
    if (!account) return null;
    account.status = status;
    return { ...account };
  }

  deleteAccount({ id }) {
    this.accounts = this.accounts.filter((item) => item.id !== id);
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

    this.accounts.push(account);
    return { ...account };
  }

  collectHotspots() {
    const now = new Date().toISOString();
    this.hotspots = [
      { id: randomUUID(), platform: '抖音', topic: 'AIGC短视频脚本自动化', heat: 97, collectedAt: now },
      { id: randomUUID(), platform: '小红书', topic: '春季穿搭爆款笔记', heat: 92, collectedAt: now },
      { id: randomUUID(), platform: '头条', topic: 'AI提效工具测评', heat: 89, collectedAt: now },
    ];

    return this.listHotspots();
  }

  listHotspots() {
    return [...this.hotspots].sort((a, b) => b.heat - a.heat);
  }

  generateContent({ hotspotId, type = '文章', tone = '专业' }) {
    const hotspot = this.hotspots.find((item) => item.id === hotspotId);
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
    this.contentAssets.push({ ...content });
    return { ...content };
  }

  listContentAssets(limit = 50) {
    return [...this.contentAssets]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  deleteContentAsset({ id }) {
    this.contentAssets = this.contentAssets.filter((item) => item.id !== id);
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

    this.schedules.push(task);
    return { ...task };
  }

  cancelSchedule({ id }) {
    const item = this.schedules.find((task) => task.id === id);
    if (item && (item.status === 'scheduled' || item.status === 'retrying')) {
      item.status = 'cancelled';
      item.completedAt = new Date().toISOString();
    }
    return { id };
  }

  retrySchedule({ id }) {
    const item = this.schedules.find((task) => task.id === id);
    if (item) {
      item.status = 'scheduled';
      item.retryCount = 0;
      item.errorMessage = null;
      item.completedAt = null;
    }
    return { id };
  }

  executeScheduleNow({ id }) {
    const item = this.schedules.find((task) => task.id === id);
    if (item) {
      item.status = 'scheduled';
      item.publishAt = new Date(Date.now() - 1000).toISOString();
      item.retryCount = 0;
      item.errorMessage = null;
      item.completedAt = null;
    }
    return { id };
  }

  clearTaskLogs() {
    this.taskLogs = [];
    return { ok: true };
  }

  clearPublishMetrics() {
    this.publishMetrics = [];
    return { ok: true };
  }

  listSchedules() {
    return [...this.schedules].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listSchedulesByStatus({ status = 'all' } = {}) {
    if (status === 'all') return this.listSchedules();
    return this.listSchedules().filter((task) => task.status === status);
  }

  listTaskLogs(limit = 100) {
    return [...this.taskLogs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  logTask(taskId, level, message) {
    this.taskLogs.push({
      id: randomUUID(),
      taskId,
      level,
      message,
      createdAt: new Date().toISOString(),
    });
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
    return [...this.publishMetrics]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  getRecentFailures(limit = 20) {
    return this.schedules
      .filter((task) => task.status === 'failed')
      .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
      .slice(0, limit)
      .map((task) => ({
        id: task.id,
        accountId: task.accountId,
        contentType: task.contentType,
        errorMessage: task.errorMessage,
        completedAt: task.completedAt,
        retryCount: task.retryCount,
      }));
  }

  getDashboardStats() {
    const accountCount = this.accounts.length;
    const activeAccountCount = this.accounts.filter((item) => item.status === 'active').length;
    const scheduleCount = this.schedules.length;
    const pendingCount = this.schedules.filter((item) => ['scheduled', 'retrying', 'running'].includes(item.status)).length;
    const successCount = this.schedules.filter((item) => item.status === 'success').length;
    const failedCount = this.schedules.filter((item) => item.status === 'failed').length;
    return { accountCount, activeAccountCount, scheduleCount, pendingCount, successCount, failedCount };
  }

  recordPublishMetric({ taskId, platform, success, errorCode = null, latencyMs }) {
    this.publishMetrics.push({
      id: randomUUID(),
      taskId,
      platform,
      success: Boolean(success),
      errorCode,
      latencyMs,
      createdAt: new Date().toISOString(),
    });
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
      this.accounts = [];
      this.hotspots = [];
      this.contentAssets = [];
      this.schedules = [];
      this.taskLogs = [];
      this.publishMetrics = [];
    }

    const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
    const hotspots = Array.isArray(snapshot.hotspots) ? snapshot.hotspots : [];
    const assets = Array.isArray(snapshot.contentAssets) ? snapshot.contentAssets : [];
    const schedules = Array.isArray(snapshot.schedules) ? snapshot.schedules : [];

    const mergeUnique = (target, incoming) => {
      const ids = new Set(target.map((item) => item.id));
      for (const item of incoming) {
        if (ids.has(item.id)) continue;
        target.push({ ...item });
      }
    };

    mergeUnique(this.accounts, accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      nickname: a.nickname,
      aiEnabled: Boolean(a.aiEnabled),
      status: a.status || 'active',
      createdAt: a.createdAt || new Date().toISOString(),
    })));

    mergeUnique(this.hotspots, hotspots.map((h) => ({
      id: h.id,
      platform: h.platform,
      topic: h.topic,
      heat: Number(h.heat || 0),
      collectedAt: h.collectedAt || new Date().toISOString(),
    })));

    mergeUnique(this.contentAssets, assets.map((c) => ({
      id: c.id,
      hotspotId: c.hotspotId,
      type: c.type,
      tone: c.tone,
      title: c.title,
      body: c.body,
      createdAt: c.createdAt || new Date().toISOString(),
    })));

    mergeUnique(this.schedules, schedules.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      contentType: t.contentType,
      contentAssetId: t.contentAssetId || null,
      publishAt: t.publishAt,
      status: t.status || 'scheduled',
      createdAt: t.createdAt || new Date().toISOString(),
      startedAt: t.startedAt || null,
      completedAt: t.completedAt || null,
      errorMessage: t.errorMessage || null,
      retryCount: Number(t.retryCount || 0),
      remoteId: t.remoteId || null,
    })));

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
    const now = Date.now();
    const runnable = this.schedules.filter((task) => task.status === 'scheduled' || task.status === 'retrying');

    for (const task of runnable) {
      const ts = new Date(task.publishAt).getTime();
      if (Number.isNaN(ts) || ts > now) continue;

      const account = this.accounts.find((item) => item.id === task.accountId);
      if (!account) {
        const err = '账号不存在或已删除';
        task.status = 'failed';
        task.completedAt = new Date().toISOString();
        task.errorMessage = err;
        this.logTask(task.id, 'error', err);
        this.logTask(task.id, 'alert', `告警：发布失败（账号缺失），task=${task.id}`);
        await this.sendAlert('publish_failed_missing_account', { taskId: task.id, accountId: task.accountId });
        continue;
      }

      task.status = 'running';
      task.startedAt = new Date().toISOString();

      const started = Date.now();
      try {
        const adapter = this.adapterRegistry.getAdapter(account.platform);
        if (!adapter) throw new Error(`未找到平台适配器: ${account.platform}`);

        const contentAsset = task.contentAssetId
          ? this.contentAssets.find((item) => item.id === task.contentAssetId) || null
          : null;

        const result = await adapter.publish({
          account,
          contentType: task.contentType,
          contentAsset,
        });

        task.status = 'success';
        task.completedAt = new Date().toISOString();
        task.errorMessage = null;
        task.remoteId = result.remoteId || null;

        this.logTask(task.id, 'info', `任务执行成功：${task.contentType} -> ${account.platform}`);
        this.recordPublishMetric({ taskId: task.id, platform: account.platform, success: true, latencyMs: Date.now() - started });
      } catch (error) {
        const retryCount = Number(task.retryCount || 0) + 1;
        const err = error instanceof Error ? error.message : '平台发布失败';

        if (retryCount <= 2) {
          task.status = 'retrying';
          task.retryCount = retryCount;
          task.errorMessage = err;
          this.logTask(task.id, 'warn', `发布失败，准备第 ${retryCount} 次重试：${err}`);
          this.recordPublishMetric({ taskId: task.id, platform: account.platform, success: false, errorCode: error.code || 'RETRY', latencyMs: Date.now() - started });
        } else {
          task.status = 'failed';
          task.completedAt = new Date().toISOString();
          task.retryCount = retryCount;
          task.errorMessage = err;
          this.logTask(task.id, 'error', `发布失败（超过重试次数）：${err}`);
          this.recordPublishMetric({ taskId: task.id, platform: account.platform, success: false, errorCode: error.code || 'FAILED', latencyMs: Date.now() - started });
          this.logTask(task.id, 'alert', `告警：任务最终失败，task=${task.id}，platform=${account.platform}`);
          await this.sendAlert('publish_failed_final', { taskId: task.id, platform: account.platform, errorCode: error.code || 'FAILED' });
        }
      }
    }

    this.taskLogs = this.listTaskLogs(100);
    this.publishMetrics = this.listPublishMetrics(500);
  }
}
