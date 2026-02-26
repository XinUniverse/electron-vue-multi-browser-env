import { createHmac } from 'node:crypto';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSignature(payload, secret) {
  return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

export class PlatformApiError extends Error {
  // 统一错误码常量
  static AUTH_FAILED = 'AUTH_FAILED';
  static RATE_LIMIT = 'RATE_LIMIT';
  static INVALID_PAYLOAD = 'INVALID_PAYLOAD';
  static TIMEOUT = 'TIMEOUT';
  static CAPTCHA_REQUIRED = 'CAPTCHA_REQUIRED';
  static CONTENT_VIOLATION = 'CONTENT_VIOLATION';

  constructor(message, code = 'UNKNOWN') {
    super(message);
    this.name = 'PlatformApiError';
    this.code = code;
  }
}

class BaseAdapter {
  constructor(
    name,
    {
      appId = process.env[`${name.toUpperCase()}_APP_ID`] || 'demo-app',
      appSecret = process.env[`${name.toUpperCase()}_APP_SECRET`] || 'demo-secret',
      mode = process.env[`${name.toUpperCase()}_MODE`] || process.env.PLATFORM_MODE || 'mock',
      publishUrl = process.env[`${name.toUpperCase()}_PUBLISH_URL`] || '',
      authUrl = process.env[`${name.toUpperCase()}_AUTH_URL`] || '',
      timeoutMs = Number.parseInt(process.env[`${name.toUpperCase()}_TIMEOUT_MS`] || process.env.PLATFORM_TIMEOUT_MS || '8000', 10),
    } = {},
  ) {
    this.name = name;
    this.appId = appId;
    this.appSecret = appSecret;
    this.lastRunAt = 0;
    this.mode = mode;
    this.publishUrl = publishUrl;
    this.authUrl = authUrl;
    this.timeoutMs = timeoutMs;

    // Token 缓存
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.refreshToken = null;

    // 配置验证
    this.validateConfig();
  }

  validateConfig() {
    // 验证运行模式
    if (!['mock', 'real'].includes(this.mode)) {
      throw new PlatformApiError(
        `无效的运行模式: ${this.mode}，必须是 'mock' 或 'real'`,
        'INVALID_CONFIG'
      );
    }

    // 在真实模式下验证必需配置
    if (this.mode === 'real') {
      if (!this.publishUrl || this.publishUrl.trim() === '') {
        throw new PlatformApiError(
          `平台 ${this.name} 在真实模式下必须配置 publishUrl`,
          'INVALID_CONFIG'
        );
      }

      // 验证 URL 格式
      try {
        new URL(this.publishUrl);
      } catch (e) {
        throw new PlatformApiError(
          `平台 ${this.name} 的 publishUrl 格式无效: ${this.publishUrl}`,
          'INVALID_CONFIG'
        );
      }

      if (!this.appId || this.appId === 'demo-app') {
        throw new PlatformApiError(
          `平台 ${this.name} 在真实模式下必须配置有效的 appId`,
          'INVALID_CONFIG'
        );
      }

      if (!this.appSecret || this.appSecret === 'demo-secret') {
        throw new PlatformApiError(
          `平台 ${this.name} 在真实模式下必须配置有效的 appSecret`,
          'INVALID_CONFIG'
        );
      }
    }

    // 验证超时时间
    if (Number.isNaN(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new PlatformApiError(
        `平台 ${this.name} 的超时时间配置无效: ${this.timeoutMs}，必须是正整数`,
        'INVALID_CONFIG'
      );
    }
  }

  /**
   * 检查 token 是否有效
   */
  isTokenValid() {
    return !!(this.accessToken && Date.now() < this.tokenExpiresAt);
  }

  /**
   * 基础鉴权方法 - 子类应该重写此方法实现平台特定的鉴权逻辑
   */
  async authenticate() {
    throw new Error('authenticate() must be implemented by subclass');
  }

  /**
   * 确保有有效的 access token
   */
  async ensureAuthenticated() {
    if (this.isTokenValid()) {
      return;
    }

    // Token 过期或不存在，重新鉴权
    await this.authenticate();
  }

  async enforceRateLimit(minIntervalMs = 500) {
    const now = Date.now();
    const delta = now - this.lastRunAt;
    if (delta < minIntervalMs) {
      await wait(minIntervalMs - delta);
    }
    this.lastRunAt = Date.now();
  }

  buildSignedRequest({ account, contentType, contentAsset }) {
    const payload = {
      appId: this.appId,
      platform: this.name,
      accountId: account.id,
      contentType,
      contentAsset,
      timestamp: Date.now(),
    };

    const signature = buildSignature(payload, this.appSecret);
    return { payload, signature };
  }

  mapApiError(error) {
    const raw = error instanceof Error ? error.message : String(error);

    // 鉴权失败错误
    if (raw.includes('AUTH') || raw.includes('UNAUTHORIZED') || raw.includes('401')) {
      return new PlatformApiError('鉴权失败，请检查签名与密钥', PlatformApiError.AUTH_FAILED);
    }

    // 限流错误
    if (raw.includes('RATE_LIMIT') || raw.includes('TOO_MANY_REQUESTS') || raw.includes('429')) {
      return new PlatformApiError('触发平台限流，请稍后重试', PlatformApiError.RATE_LIMIT);
    }

    // 参数错误
    if (raw.includes('INVALID_PAYLOAD') || raw.includes('INVALID_PARAM') || raw.includes('BAD_REQUEST') || raw.includes('400')) {
      return new PlatformApiError('请求参数无效，请检查内容格式', PlatformApiError.INVALID_PAYLOAD);
    }

    // 超时错误
    if (raw.includes('TIMEOUT') || raw.includes('ETIMEDOUT') || raw.includes('ECONNABORTED')) {
      return new PlatformApiError('请求超时，请检查网络连接', PlatformApiError.TIMEOUT);
    }

    // 验证码要求
    if (raw.includes('CAPTCHA') || raw.includes('VERIFY') || raw.includes('验证码')) {
      return new PlatformApiError('平台要求验证码验证，需要人工介入', PlatformApiError.CAPTCHA_REQUIRED);
    }

    // 内容违规错误
    if (raw.includes('CONTENT_VIOLATION') || raw.includes('SENSITIVE') || raw.includes('违规') || raw.includes('敏感')) {
      return new PlatformApiError('内容包含违规信息，发布被拒绝', PlatformApiError.CONTENT_VIOLATION);
    }

    return new PlatformApiError(`平台请求失败: ${raw}`, 'REQUEST_FAILED');
  }

  async callRemotePublish({ account, contentType, contentAsset }) {
    if (!this.publishUrl || this.mode !== 'real') {
      throw new Error('real mode not enabled or publishUrl missing');
    }
    const { payload, signature } = this.buildSignedRequest({ account, contentType, contentAsset });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.publishUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-signature': signature,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        const code = data.errorCode || 'REQUEST_FAILED';
        const msg = data.message || `http ${res.status}`;
        throw new PlatformApiError(msg, code);
      }
      return {
        ok: true,
        platform: this.name,
        remoteId: data.remoteId || `${this.name}-${Date.now()}`,
        signature,
        requestPayload: payload,
      };
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        throw new PlatformApiError('请求超时', PlatformApiError.TIMEOUT);
      }
      if (e instanceof PlatformApiError) throw e;
      throw this.mapApiError(e);
    } finally {
      clearTimeout(timer);
    }
  }

  async publish() {
    throw new Error('publish not implemented');
  }
}

class DouyinAdapter extends BaseAdapter {
  constructor(config = {}) {
    // 使用英文名称作为环境变量前缀
    const envPrefix = 'DOUYIN';
    const configWithEnv = {
      appId: config.appId || process.env[`${envPrefix}_APP_ID`],
      appSecret: config.appSecret || process.env[`${envPrefix}_APP_SECRET`],
      mode: config.mode || process.env[`${envPrefix}_MODE`] || process.env.PLATFORM_MODE,
      publishUrl: config.publishUrl || process.env[`${envPrefix}_PUBLISH_URL`],
      authUrl: config.authUrl || process.env[`${envPrefix}_AUTH_URL`] || 'https://open.douyin.com/oauth/access_token',
      timeoutMs: config.timeoutMs || (process.env[`${envPrefix}_TIMEOUT_MS`] ? Number.parseInt(process.env[`${envPrefix}_TIMEOUT_MS`], 10) : undefined),
    };
    super('抖音', configWithEnv);
  }

  /**
   * 实现抖音平台的 OAuth 2.0 鉴权流程
   * 使用 client_credentials 授权方式获取 access_token
   */
  async authenticate() {
    if (this.mode === 'mock') {
      // 模拟模式下生成假 token
      this.accessToken = `mock_token_${Date.now()}`;
      this.tokenExpiresAt = Date.now() + 7200 * 1000; // 2小时后过期
      console.log(`[${this.name}] 模拟模式：生成模拟 access_token`);
      return;
    }

    console.log(`[${this.name}] 开始 OAuth 2.0 鉴权流程...`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // 构建鉴权请求参数
      const authParams = {
        client_key: this.appId,
        client_secret: this.appSecret,
        grant_type: 'client_credential',
      };

      const url = `${this.authUrl}?${new URLSearchParams(authParams).toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      const data = await response.json();

      // 检查响应状态
      if (!response.ok || data.error_code !== 0) {
        const errorMsg = data.description || data.message || `HTTP ${response.status}`;
        console.error(`[${this.name}] 鉴权失败:`, errorMsg);
        throw new PlatformApiError(
          `抖音鉴权失败: ${errorMsg}`,
          PlatformApiError.AUTH_FAILED
        );
      }

      // 提取 token 信息
      const { access_token, expires_in, refresh_token } = data.data || {};

      if (!access_token) {
        throw new PlatformApiError(
          '抖音鉴权响应中缺少 access_token',
          PlatformApiError.AUTH_FAILED
        );
      }

      // 缓存 token 信息
      this.accessToken = access_token;
      // 提前5分钟过期，避免边界情况
      this.tokenExpiresAt = Date.now() + (expires_in - 300) * 1000;
      this.refreshToken = refresh_token;

      console.log(`[${this.name}] 鉴权成功，token 将在 ${expires_in} 秒后过期`);
    } catch (error) {
      clearTimeout(timer);

      if (error.name === 'AbortError') {
        throw new PlatformApiError(
          '抖音鉴权请求超时',
          PlatformApiError.TIMEOUT
        );
      }

      if (error instanceof PlatformApiError) {
        throw error;
      }

      throw this.mapApiError(error);
    }
  }

  /**
   * 刷新 access token
   */
  async refreshAccessToken() {
    if (this.mode === 'mock' || !this.refreshToken) {
      // 模拟模式或没有 refresh_token 时，重新鉴权
      return this.authenticate();
    }

    console.log(`[${this.name}] 刷新 access_token...`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const refreshParams = {
        client_key: this.appId,
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      };

      const url = `${this.authUrl}?${new URLSearchParams(refreshParams).toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      const data = await response.json();

      if (!response.ok || data.error_code !== 0) {
        console.warn(`[${this.name}] Token 刷新失败，将重新鉴权`);
        return this.authenticate();
      }

      const { access_token, expires_in, refresh_token } = data.data || {};

      if (!access_token) {
        return this.authenticate();
      }

      this.accessToken = access_token;
      this.tokenExpiresAt = Date.now() + (expires_in - 300) * 1000;
      this.refreshToken = refresh_token;

      console.log(`[${this.name}] Token 刷新成功`);
    } catch (error) {
      clearTimeout(timer);
      console.warn(`[${this.name}] Token 刷新异常，将重新鉴权:`, error.message);
      return this.authenticate();
    }
  }

  /**
   * 映射抖音平台错误码到统一错误类型
   * @param {Object} errorData - 抖音 API 返回的错误数据
   * @returns {PlatformApiError} 统一的平台错误
   */
  mapDouyinError(errorData) {
    const errorCode = errorData.error_code || errorData.code;
    const errorMsg = errorData.description || errorData.message || '未知错误';

    // 抖音平台错误码映射
    // 参考：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-management/error-code

    // 鉴权失败相关错误码
    if ([2190001, 2190002, 2190003, 2190004, 2190008].includes(errorCode)) {
      return new PlatformApiError(
        `抖音鉴权失败: ${errorMsg}`,
        PlatformApiError.AUTH_FAILED
      );
    }

    // 限流相关错误码
    if ([2190015, 2100002].includes(errorCode)) {
      return new PlatformApiError(
        `抖音 API 调用频率超限: ${errorMsg}`,
        PlatformApiError.RATE_LIMIT
      );
    }

    // 参数错误相关错误码
    if ([2190005, 2190006, 2190007, 10002].includes(errorCode)) {
      return new PlatformApiError(
        `抖音请求参数无效: ${errorMsg}`,
        PlatformApiError.INVALID_PAYLOAD
      );
    }

    // 内容违规相关错误码
    if ([2190016, 2190017, 2190018].includes(errorCode)) {
      return new PlatformApiError(
        `抖音内容违规: ${errorMsg}`,
        PlatformApiError.CONTENT_VIOLATION
      );
    }

    // 验证码要求
    if (errorMsg.includes('验证码') || errorMsg.includes('captcha') || errorMsg.includes('verify')) {
      return new PlatformApiError(
        `抖音要求验证码验证: ${errorMsg}`,
        PlatformApiError.CAPTCHA_REQUIRED
      );
    }

    // 使用基类的通用错误映射
    return super.mapApiError(new Error(errorMsg));
  }
  /**
   * 上传图片到抖音平台
   * @param {string} imageUrl - 图片URL或本地路径
   * @returns {Promise<string>} 抖音平台的图片ID
   */
  async uploadImage(imageUrl) {
    if (this.mode === 'mock') {
      // 模拟模式下返回假图片ID
      return `mock_image_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }

    console.log(`[${this.name}] 上传图片: ${imageUrl}`);

    const uploadUrl = this.config.uploadUrl || process.env.DOUYIN_UPLOAD_URL || 'https://open.douyin.com/api/image/upload';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // 构建上传请求
      const formData = new FormData();

      // 如果是URL，先下载图片
      let imageBlob;
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error(`下载图片失败: ${imageResponse.status}`);
        }
        imageBlob = await imageResponse.blob();
      } else {
        // 本地文件路径处理
        const fs = await import('node:fs');
        const imageBuffer = fs.readFileSync(imageUrl);
        imageBlob = new Blob([imageBuffer]);
      }

      formData.append('image', imageBlob);
      formData.append('access_token', this.accessToken);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timer);

      const data = await response.json();

      if (!response.ok || data.error_code !== 0) {
        console.error(`[${this.name}] 图片上传失败`);
        throw this.mapDouyinError(data);
      }

      const imageId = data.data?.image_id;
      if (!imageId) {
        throw new PlatformApiError(
          '图片上传响应中缺少 image_id',
          PlatformApiError.REQUEST_FAILED
        );
      }

      console.log(`[${this.name}] 图片上传成功: ${imageId}`);
      return imageId;
    } catch (error) {
      clearTimeout(timer);

      if (error.name === 'AbortError') {
        throw new PlatformApiError(
          '图片上传超时',
          PlatformApiError.TIMEOUT
        );
      }

      if (error instanceof PlatformApiError) {
        throw error;
      }

      throw this.mapApiError(error);
    }
  }

  /**
   * 发布图文内容到抖音平台
   * @param {Object} params - 发布参数
   * @param {Object} params.account - 账号信息
   * @param {Object} params.contentAsset - 内容资产
   * @param {string} params.contentAsset.title - 标题
   * @param {string} params.contentAsset.body - 正文
   * @param {string[]} params.contentAsset.images - 图片URL列表
   * @returns {Promise<Object>} 发布结果
   */
  async publishImageText({ account, contentAsset }) {
    console.log(`[${this.name}] 开始发布图文内容...`);

    // 确保已鉴权
    await this.ensureAuthenticated();

    // 内容合规检查
    const { validateContentCompliance } = await import('../utils/content-validator.js');
    validateContentCompliance(contentAsset, this.name);

    if (this.mode === 'mock') {
      // 模拟模式下返回成功结果
      console.log(`[${this.name}] 模拟模式：图文发布成功`);
      return {
        ok: true,
        platform: this.name,
        remoteId: `dy_imagetext_${Date.now()}`,
        contentType: 'image-text',
      };
    }

    // 真实模式：上传图片
    const imageIds = [];
    if (contentAsset.images && contentAsset.images.length > 0) {
      console.log(`[${this.name}] 上传 ${contentAsset.images.length} 张图片...`);
      for (const imageUrl of contentAsset.images) {
        const imageId = await this.uploadImage(imageUrl);
        imageIds.push(imageId);
      }
    }

    // 构建发布请求
    const publishUrl = this.config.imageTextPublishUrl ||
      process.env.DOUYIN_IMAGE_TEXT_PUBLISH_URL ||
      'https://open.douyin.com/api/image_text/publish';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const requestBody = {
        access_token: this.accessToken,
        open_id: account.openId || account.accountId,
        text: contentAsset.body || '',
        title: contentAsset.title || '',
        image_list: imageIds,
        // 可选参数
        cover_image_id: imageIds[0], // 使用第一张图作为封面
        at_users: contentAsset.atUsers || [],
        poi_id: contentAsset.poiId || '',
        micro_app_id: contentAsset.microAppId || '',
      };

      console.log(`[${this.name}] 发送发布请求...`);

      const response = await fetch(publishUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timer);

      const data = await response.json();

      // 检查响应状态并使用抖音专用错误映射
      if (!response.ok || data.error_code !== 0) {
        console.error(`[${this.name}] 图文发布失败`);
        throw this.mapDouyinError(data);
      }

      const itemId = data.data?.item_id;
      if (!itemId) {
        throw new PlatformApiError(
          '发布响应中缺少 item_id',
          PlatformApiError.REQUEST_FAILED
        );
      }

      console.log(`[${this.name}] 图文发布成功: ${itemId}`);

      return {
        ok: true,
        platform: this.name,
        remoteId: itemId,
        contentType: 'image-text',
        publishTime: Date.now(),
      };
    } catch (error) {
      clearTimeout(timer);

      if (error.name === 'AbortError') {
        throw new PlatformApiError(
          '发布请求超时',
          PlatformApiError.TIMEOUT
        );
      }

      if (error instanceof PlatformApiError) {
        throw error;
      }

      throw this.mapApiError(error);
    }
  }

  /**
   * 上传视频到抖音平台
   * @param {string} videoUrl - 视频URL或本地路径
   * @returns {Promise<string>} 抖音平台的视频ID
   */
  async uploadVideo(videoUrl) {
    if (this.mode === 'mock') {
      // 模拟模式下返回假视频ID
      return `mock_video_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }

    console.log(`[${this.name}] 上传视频: ${videoUrl}`);

    const uploadUrl = this.config.videoUploadUrl || process.env.DOUYIN_VIDEO_UPLOAD_URL || 'https://open.douyin.com/api/video/upload';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs * 3); // 视频上传需要更长时间

    try {
      // 构建上传请求
      const formData = new FormData();

      // 如果是URL，先下载视频
      let videoBlob;
      if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
          throw new Error(`下载视频失败: ${videoResponse.status}`);
        }
        videoBlob = await videoResponse.blob();
      } else {
        // 本地文件路径处理
        const fs = await import('node:fs');
        const videoBuffer = fs.readFileSync(videoUrl);
        videoBlob = new Blob([videoBuffer]);
      }

      formData.append('video', videoBlob);
      formData.append('access_token', this.accessToken);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timer);

      const data = await response.json();

      if (!response.ok || data.error_code !== 0) {
        console.error(`[${this.name}] 视频上传失败`);
        throw this.mapDouyinError(data);
      }

      const videoId = data.data?.video_id;
      if (!videoId) {
        throw new PlatformApiError(
          '视频上传响应中缺少 video_id',
          PlatformApiError.REQUEST_FAILED
        );
      }

      console.log(`[${this.name}] 视频上传成功: ${videoId}`);
      return videoId;
    } catch (error) {
      clearTimeout(timer);

      if (error.name === 'AbortError') {
        throw new PlatformApiError(
          '视频上传超时',
          PlatformApiError.TIMEOUT
        );
      }

      if (error instanceof PlatformApiError) {
        throw error;
      }

      throw this.mapApiError(error);
    }
  }

  /**
   * 发布视频内容到抖音平台
   * @param {Object} params - 发布参数
   * @param {Object} params.account - 账号信息
   * @param {Object} params.contentAsset - 内容资产
   * @param {string} params.contentAsset.title - 标题
   * @param {string} params.contentAsset.body - 描述文本
   * @param {string} params.contentAsset.videoUrl - 视频URL或本地路径
   * @param {string} [params.contentAsset.coverUrl] - 封面图URL（可选）
   * @returns {Promise<Object>} 发布结果
   */
  async publishVideo({ account, contentAsset }) {
    console.log(`[${this.name}] 开始发布视频内容...`);

    // 确保已鉴权
    await this.ensureAuthenticated();

    // 验证必需字段
    if (!contentAsset.videoUrl) {
      throw new PlatformApiError(
        '视频内容缺少 videoUrl 字段',
        PlatformApiError.INVALID_PAYLOAD
      );
    }

    // 内容合规检查
    const { validateContentCompliance } = await import('../utils/content-validator.js');
    validateContentCompliance(contentAsset, this.name);

    if (this.mode === 'mock') {
      // 模拟模式下返回成功结果
      console.log(`[${this.name}] 模拟模式：视频发布成功`);
      return {
        ok: true,
        platform: this.name,
        remoteId: `dy_video_${Date.now()}`,
        contentType: 'video',
      };
    }

    // 真实模式：上传视频

    console.log(`[${this.name}] 上传视频文件...`);
    const videoId = await this.uploadVideo(contentAsset.videoUrl);

    // 如果有封面图，也上传封面
    let coverId;
    if (contentAsset.coverUrl) {
      console.log(`[${this.name}] 上传封面图...`);
      coverId = await this.uploadImage(contentAsset.coverUrl);
    }

    // 构建发布请求
    const publishUrl = this.config.videoPublishUrl ||
      process.env.DOUYIN_VIDEO_PUBLISH_URL ||
      'https://open.douyin.com/api/video/publish';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const requestBody = {
        access_token: this.accessToken,
        open_id: account.openId || account.accountId,
        video_id: videoId,
        text: contentAsset.body || contentAsset.title || '',
        // 可选参数
        cover_id: coverId,
        title: contentAsset.title || '',
        at_users: contentAsset.atUsers || [],
        poi_id: contentAsset.poiId || '',
        micro_app_id: contentAsset.microAppId || '',
        // 视频特定参数
        privacy_level: contentAsset.privacyLevel || 'public', // public, friend, private
        allow_comment: contentAsset.allowComment !== false,
        allow_duet: contentAsset.allowDuet !== false,
        allow_stitch: contentAsset.allowStitch !== false,
      };

      console.log(`[${this.name}] 发送视频发布请求...`);

      const response = await fetch(publishUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timer);

      const data = await response.json();

      // 检查响应状态并使用抖音专用错误映射
      if (!response.ok || data.error_code !== 0) {
        console.error(`[${this.name}] 视频发布失败`);
        throw this.mapDouyinError(data);
      }

      const itemId = data.data?.item_id;
      if (!itemId) {
        throw new PlatformApiError(
          '发布响应中缺少 item_id',
          PlatformApiError.REQUEST_FAILED
        );
      }

      console.log(`[${this.name}] 视频发布成功: ${itemId}`);

      return {
        ok: true,
        platform: this.name,
        remoteId: itemId,
        contentType: 'video',
        publishTime: Date.now(),
      };
    } catch (error) {
      clearTimeout(timer);

      if (error.name === 'AbortError') {
        throw new PlatformApiError(
          '视频发布请求超时',
          PlatformApiError.TIMEOUT
        );
      }

      if (error instanceof PlatformApiError) {
        throw error;
      }

      throw this.mapApiError(error);
    }
  }

  async publish({ account, contentType, contentAsset }) {
    // 限流控制：确保遵守抖音平台的 API 调用频率限制
    await this.enforceRateLimit(500);

    // 确保有有效的 access token
    await this.ensureAuthenticated();

    // 内容合规检查（对所有内容类型进行检查）
    const { validateContentCompliance } = await import('../utils/content-validator.js');
    validateContentCompliance(contentAsset, this.name);

    // 根据内容类型路由到不同的发布方法
    if (contentType === 'image-text' || contentType === '图文') {
      return this.publishImageText({ account, contentAsset });
    }

    if (contentType === 'video' || contentType === '视频') {
      return this.publishVideo({ account, contentAsset });
    }

    // 其他内容类型使用通用发布方法
    if (this.mode === 'real') {
      return this.callRemotePublish({ account, contentType, contentAsset });
    }

    const { payload, signature } = this.buildSignedRequest({ account, contentType });
    if (contentType === '模拟鉴权失败') {
      throw this.mapApiError(new Error('AUTH token expired'));
    }
    return { ok: true, platform: this.name, remoteId: `dy-${Date.now()}`, signature, requestPayload: payload };
  }
}

class XiaohongshuAdapter extends BaseAdapter {
  constructor(config = {}) {
    // 使用英文名称作为环境变量前缀
    const envPrefix = 'XIAOHONGSHU';
    const configWithEnv = {
      appId: config.appId || process.env[`${envPrefix}_APP_ID`],
      appSecret: config.appSecret || process.env[`${envPrefix}_APP_SECRET`],
      mode: config.mode || process.env[`${envPrefix}_MODE`] || process.env.PLATFORM_MODE,
      publishUrl: config.publishUrl || process.env[`${envPrefix}_PUBLISH_URL`],
      timeoutMs: config.timeoutMs || (process.env[`${envPrefix}_TIMEOUT_MS`] ? Number.parseInt(process.env[`${envPrefix}_TIMEOUT_MS`], 10) : undefined),
    };
    super('小红书', configWithEnv);
  }

  async publish({ account, contentType, contentAsset }) {
    await this.enforceRateLimit(500);
    if (this.mode === 'real') {
      return this.callRemotePublish({ account, contentType, contentAsset });
    }
    const { payload, signature } = this.buildSignedRequest({ account, contentType });
    if (contentType === '模拟限流失败') {
      throw this.mapApiError(new Error('RATE_LIMIT reached'));
    }
    return { ok: true, platform: this.name, remoteId: `xhs-${Date.now()}`, signature, requestPayload: payload };
  }
}

class ToutiaoAdapter extends BaseAdapter {
  constructor(config = {}) {
    // 使用英文名称作为环境变量前缀
    const envPrefix = 'TOUTIAO';
    const configWithEnv = {
      appId: config.appId || process.env[`${envPrefix}_APP_ID`],
      appSecret: config.appSecret || process.env[`${envPrefix}_APP_SECRET`],
      mode: config.mode || process.env[`${envPrefix}_MODE`] || process.env.PLATFORM_MODE,
      publishUrl: config.publishUrl || process.env[`${envPrefix}_PUBLISH_URL`],
      timeoutMs: config.timeoutMs || (process.env[`${envPrefix}_TIMEOUT_MS`] ? Number.parseInt(process.env[`${envPrefix}_TIMEOUT_MS`], 10) : undefined),
    };
    super('头条', configWithEnv);
  }

  async publish({ account, contentType, contentAsset }) {
    await this.enforceRateLimit(500);
    if (this.mode === 'real') {
      return this.callRemotePublish({ account, contentType, contentAsset });
    }
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
