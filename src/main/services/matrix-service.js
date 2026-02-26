import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class MatrixService {
  constructor({ baseDir, platforms = ['抖音', '小红书', '头条'] }) {
    this.platforms = platforms;
    this.storeFile = path.join(baseDir, 'matrix-store.json');
    this.data = this.loadStore();
  }

  loadStore() {
    try {
      if (fs.existsSync(this.storeFile)) {
        return JSON.parse(fs.readFileSync(this.storeFile, 'utf-8'));
      }
    } catch {
      // fallback to default store
    }
    return { accounts: [], hotspots: [], schedules: [], taskLogs: [] };
  }

  persist() {
    fs.mkdirSync(path.dirname(this.storeFile), { recursive: true });
    fs.writeFileSync(this.storeFile, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  getPlatforms() {
    return this.platforms;
  }

  listAccounts() {
    return this.data.accounts;
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
    this.data.accounts.push(account);
    this.persist();
    return account;
  }

  collectHotspots() {
    const now = new Date().toISOString();
    this.data.hotspots = [
      { id: randomUUID(), platform: '抖音', topic: 'AIGC短视频脚本自动化', heat: 97, collectedAt: now },
      { id: randomUUID(), platform: '小红书', topic: '春季穿搭爆款笔记', heat: 92, collectedAt: now },
      { id: randomUUID(), platform: '头条', topic: 'AI提效工具测评', heat: 89, collectedAt: now },
    ];
    this.persist();
    return this.data.hotspots;
  }

  listHotspots() {
    return this.data.hotspots;
  }

  generateContent({ hotspotId, type = '文章', tone = '专业' }) {
    const hotspot = this.data.hotspots.find((item) => item.id === hotspotId);
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
    this.data.schedules.push(task);
    this.persist();
    return task;
  }

  listSchedules() {
    return this.data.schedules;
  }

  listTaskLogs() {
    return this.data.taskLogs;
  }

  runDueTasks() {
    const now = Date.now();
    let changed = false;

    for (const task of this.data.schedules) {
      if (task.status !== 'scheduled') continue;
      const ts = new Date(task.publishAt).getTime();
      if (Number.isNaN(ts) || ts > now) continue;

      task.status = 'running';
      task.startedAt = new Date().toISOString();
      changed = true;

      const accountExists = this.data.accounts.some((a) => a.id === task.accountId);
      if (accountExists) {
        task.status = 'success';
        task.completedAt = new Date().toISOString();
        this.data.taskLogs.unshift({
          id: randomUUID(),
          taskId: task.id,
          level: 'info',
          message: `任务执行成功：${task.contentType}`,
          createdAt: new Date().toISOString(),
        });
      } else {
        task.status = 'failed';
        task.completedAt = new Date().toISOString();
        task.errorMessage = '账号不存在或已删除';
        this.data.taskLogs.unshift({
          id: randomUUID(),
          taskId: task.id,
          level: 'error',
          message: task.errorMessage,
          createdAt: new Date().toISOString(),
        });
      }
      changed = true;
    }

    this.data.taskLogs = this.data.taskLogs.slice(0, 100);
    if (changed) this.persist();
  }
}
