function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class BaseAdapter {
  constructor(name) {
    this.name = name;
    this.lastRunAt = 0;
  }

  async enforceRateLimit(minIntervalMs = 500) {
    const now = Date.now();
    const delta = now - this.lastRunAt;
    if (delta < minIntervalMs) {
      await wait(minIntervalMs - delta);
    }
    this.lastRunAt = Date.now();
  }

  async publish() {
    throw new Error('publish not implemented');
  }
}

class DouyinAdapter extends BaseAdapter {
  constructor() {
    super('抖音');
  }

  async publish({ contentType }) {
    await this.enforceRateLimit(500);
    return { ok: true, platform: this.name, remoteId: `dy-${Date.now()}`, contentType };
  }
}

class XiaohongshuAdapter extends BaseAdapter {
  constructor() {
    super('小红书');
  }

  async publish({ contentType }) {
    await this.enforceRateLimit(500);
    return { ok: true, platform: this.name, remoteId: `xhs-${Date.now()}`, contentType };
  }
}

class ToutiaoAdapter extends BaseAdapter {
  constructor() {
    super('头条');
  }

  async publish({ contentType }) {
    await this.enforceRateLimit(500);
    return { ok: true, platform: this.name, remoteId: `tt-${Date.now()}`, contentType };
  }
}

export class PlatformAdapterRegistry {
  constructor() {
    this.adapters = new Map([
      ['抖音', new DouyinAdapter()],
      ['小红书', new XiaohongshuAdapter()],
      ['头条', new ToutiaoAdapter()],
    ]);
  }

  getAdapter(platform) {
    return this.adapters.get(platform);
  }
}
