import { createHmac } from 'node:crypto';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSignature(payload, secret) {
  return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

export class PlatformApiError extends Error {
  constructor(message, code = 'UNKNOWN') {
    super(message);
    this.name = 'PlatformApiError';
    this.code = code;
  }
}

class BaseAdapter {
  constructor(name, { appId = 'demo-app', appSecret = 'demo-secret' } = {}) {
    this.name = name;
    this.appId = appId;
    this.appSecret = appSecret;
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

  buildSignedRequest({ account, contentType }) {
    const payload = {
      appId: this.appId,
      platform: this.name,
      accountId: account.id,
      contentType,
      timestamp: Date.now(),
    };

    const signature = buildSignature(payload, this.appSecret);
    return { payload, signature };
  }

  mapApiError(error) {
    const raw = error instanceof Error ? error.message : String(error);
    if (raw.includes('AUTH')) {
      return new PlatformApiError('鉴权失败，请检查签名与密钥', 'AUTH_FAILED');
    }
    if (raw.includes('RATE_LIMIT')) {
      return new PlatformApiError('触发平台限流，请稍后重试', 'RATE_LIMIT');
    }
    if (raw.includes('INVALID_PAYLOAD')) {
      return new PlatformApiError('请求参数无效', 'INVALID_PAYLOAD');
    }
    return new PlatformApiError(`平台请求失败: ${raw}`, 'REQUEST_FAILED');
  }

  async publish() {
    throw new Error('publish not implemented');
  }
}

class DouyinAdapter extends BaseAdapter {
  constructor(config) {
    super('抖音', config);
  }

  async publish({ account, contentType }) {
    await this.enforceRateLimit(500);
    const { payload, signature } = this.buildSignedRequest({ account, contentType });
    if (contentType === '模拟鉴权失败') {
      throw this.mapApiError(new Error('AUTH token expired'));
    }
    return { ok: true, platform: this.name, remoteId: `dy-${Date.now()}`, signature, requestPayload: payload };
  }
}

class XiaohongshuAdapter extends BaseAdapter {
  constructor(config) {
    super('小红书', config);
  }

  async publish({ account, contentType }) {
    await this.enforceRateLimit(500);
    const { payload, signature } = this.buildSignedRequest({ account, contentType });
    if (contentType === '模拟限流失败') {
      throw this.mapApiError(new Error('RATE_LIMIT reached'));
    }
    return { ok: true, platform: this.name, remoteId: `xhs-${Date.now()}`, signature, requestPayload: payload };
  }
}

class ToutiaoAdapter extends BaseAdapter {
  constructor(config) {
    super('头条', config);
  }

  async publish({ account, contentType }) {
    await this.enforceRateLimit(500);
    const { payload, signature } = this.buildSignedRequest({ account, contentType });
    if (contentType === '模拟参数失败') {
      throw this.mapApiError(new Error('INVALID_PAYLOAD body missing'));
    }
    return { ok: true, platform: this.name, remoteId: `tt-${Date.now()}`, signature, requestPayload: payload };
  }
}

export class PlatformAdapterRegistry {
  constructor(config = {}) {
    this.adapters = new Map([
      ['抖音', new DouyinAdapter(config.抖音)],
      ['小红书', new XiaohongshuAdapter(config.小红书)],
      ['头条', new ToutiaoAdapter(config.头条)],
    ]);
  }

  getAdapter(platform) {
    return this.adapters.get(platform);
  }
}
