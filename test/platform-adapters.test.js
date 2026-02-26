import test from 'node:test';
import assert from 'node:assert/strict';
import { PlatformApiError, PlatformAdapterRegistry } from '../src/main/services/platform-adapters.js';

test('BaseAdapter accepts valid mock mode configuration', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');
  assert.strictEqual(adapter.mode, 'mock');
  assert.strictEqual(adapter.appId, 'demo-app');
  assert.strictEqual(adapter.appSecret, 'demo-secret');
});

test('BaseAdapter validates mode configuration', () => {
  assert.throws(
    () => new PlatformAdapterRegistry({
      抖音: { mode: 'invalid' },
    }),
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'INVALID_CONFIG' &&
        err.message.includes('无效的运行模式');
    }
  );
});

test('BaseAdapter requires publishUrl in real mode', () => {
  assert.throws(
    () => new PlatformAdapterRegistry({
      抖音: { mode: 'real' },
    }),
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'INVALID_CONFIG' &&
        err.message.includes('必须配置 publishUrl');
    }
  );
});

test('BaseAdapter validates publishUrl format in real mode', () => {
  assert.throws(
    () => new PlatformAdapterRegistry({
      抖音: { mode: 'real', publishUrl: 'not-a-valid-url', appId: 'test-id', appSecret: 'test-secret' },
    }),
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'INVALID_CONFIG' &&
        err.message.includes('publishUrl 格式无效');
    }
  );
});

test('BaseAdapter requires valid appId in real mode', () => {
  assert.throws(
    () => new PlatformAdapterRegistry({
      抖音: { mode: 'real', publishUrl: 'https://api.example.com', appId: 'demo-app' },
    }),
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'INVALID_CONFIG' &&
        err.message.includes('必须配置有效的 appId');
    }
  );
});

test('BaseAdapter requires valid appSecret in real mode', () => {
  assert.throws(
    () => new PlatformAdapterRegistry({
      抖音: { mode: 'real', publishUrl: 'https://api.example.com', appId: 'real-app-id', appSecret: 'demo-secret' },
    }),
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'INVALID_CONFIG' &&
        err.message.includes('必须配置有效的 appSecret');
    }
  );
});

test('BaseAdapter accepts valid real mode configuration', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: {
      mode: 'real',
      publishUrl: 'https://api.douyin.com/publish',
      appId: 'real-app-id',
      appSecret: 'real-app-secret',
    },
  });
  const adapter = registry.getAdapter('抖音');
  assert.strictEqual(adapter.mode, 'real');
  assert.strictEqual(adapter.publishUrl, 'https://api.douyin.com/publish');
  assert.strictEqual(adapter.appId, 'real-app-id');
  assert.strictEqual(adapter.appSecret, 'real-app-secret');
});

test('BaseAdapter validates timeout configuration', () => {
  assert.throws(
    () => new PlatformAdapterRegistry({
      抖音: { timeoutMs: -1 },
    }),
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'INVALID_CONFIG' &&
        err.message.includes('超时时间配置无效');
    }
  );
});

test('BaseAdapter accepts custom timeout configuration', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { timeoutMs: 5000 },
  });
  const adapter = registry.getAdapter('抖音');
  assert.strictEqual(adapter.timeoutMs, 5000);
});

test('BaseAdapter supports environment variable configuration', () => {
  // Save original env vars
  const originalMode = process.env.PLATFORM_MODE;
  const originalTimeout = process.env.PLATFORM_TIMEOUT_MS;

  try {
    // Set test env vars
    process.env.PLATFORM_MODE = 'mock';
    process.env.PLATFORM_TIMEOUT_MS = '10000';

    const registry = new PlatformAdapterRegistry({});
    const adapter = registry.getAdapter('抖音');

    assert.strictEqual(adapter.mode, 'mock');
    assert.strictEqual(adapter.timeoutMs, 10000);
  } finally {
    // Restore original env vars
    if (originalMode !== undefined) {
      process.env.PLATFORM_MODE = originalMode;
    } else {
      delete process.env.PLATFORM_MODE;
    }
    if (originalTimeout !== undefined) {
      process.env.PLATFORM_TIMEOUT_MS = originalTimeout;
    } else {
      delete process.env.PLATFORM_TIMEOUT_MS;
    }
  }
});

test('Platform-specific environment variables override global ones', () => {
  // Save original env vars
  const originalMode = process.env.PLATFORM_MODE;
  const originalDouyinMode = process.env.DOUYIN_MODE;

  try {
    // Set test env vars
    process.env.PLATFORM_MODE = 'mock';
    process.env.DOUYIN_MODE = 'mock';

    const registry = new PlatformAdapterRegistry({});
    const adapter = registry.getAdapter('抖音');

    assert.strictEqual(adapter.mode, 'mock');
  } finally {
    // Restore original env vars
    if (originalMode !== undefined) {
      process.env.PLATFORM_MODE = originalMode;
    } else {
      delete process.env.PLATFORM_MODE;
    }
    if (originalDouyinMode !== undefined) {
      process.env.DOUYIN_MODE = originalDouyinMode;
    } else {
      delete process.env.DOUYIN_MODE;
    }
  }
});

// Error mapping tests
test('PlatformApiError has all required error code constants', () => {
  assert.strictEqual(PlatformApiError.AUTH_FAILED, 'AUTH_FAILED');
  assert.strictEqual(PlatformApiError.RATE_LIMIT, 'RATE_LIMIT');
  assert.strictEqual(PlatformApiError.INVALID_PAYLOAD, 'INVALID_PAYLOAD');
  assert.strictEqual(PlatformApiError.TIMEOUT, 'TIMEOUT');
  assert.strictEqual(PlatformApiError.CAPTCHA_REQUIRED, 'CAPTCHA_REQUIRED');
  assert.strictEqual(PlatformApiError.CONTENT_VIOLATION, 'CONTENT_VIOLATION');
});

test('mapApiError correctly maps AUTH errors', () => {
  const registry = new PlatformAdapterRegistry({});
  const adapter = registry.getAdapter('抖音');

  const error1 = adapter.mapApiError(new Error('AUTH token expired'));
  assert.strictEqual(error1.code, 'AUTH_FAILED');
  assert.ok(error1.message.includes('鉴权失败'));

  const error2 = adapter.mapApiError(new Error('UNAUTHORIZED access'));
  assert.strictEqual(error2.code, 'AUTH_FAILED');

  const error3 = adapter.mapApiError(new Error('401 error'));
  assert.strictEqual(error3.code, 'AUTH_FAILED');
});

test('mapApiError correctly maps RATE_LIMIT errors', () => {
  const registry = new PlatformAdapterRegistry({});
  const adapter = registry.getAdapter('抖音');

  const error1 = adapter.mapApiError(new Error('RATE_LIMIT exceeded'));
  assert.strictEqual(error1.code, 'RATE_LIMIT');
  assert.ok(error1.message.includes('限流'));

  const error2 = adapter.mapApiError(new Error('TOO_MANY_REQUESTS'));
  assert.strictEqual(error2.code, 'RATE_LIMIT');

  const error3 = adapter.mapApiError(new Error('429 error'));
  assert.strictEqual(error3.code, 'RATE_LIMIT');
});

test('mapApiError correctly maps INVALID_PAYLOAD errors', () => {
  const registry = new PlatformAdapterRegistry({});
  const adapter = registry.getAdapter('抖音');

  const error1 = adapter.mapApiError(new Error('INVALID_PAYLOAD body missing'));
  assert.strictEqual(error1.code, 'INVALID_PAYLOAD');
  assert.ok(error1.message.includes('参数无效'));

  const error2 = adapter.mapApiError(new Error('INVALID_PARAM title'));
  assert.strictEqual(error2.code, 'INVALID_PAYLOAD');

  const error3 = adapter.mapApiError(new Error('BAD_REQUEST'));
  assert.strictEqual(error3.code, 'INVALID_PAYLOAD');

  const error4 = adapter.mapApiError(new Error('400 error'));
  assert.strictEqual(error4.code, 'INVALID_PAYLOAD');
});

test('mapApiError correctly maps TIMEOUT errors', () => {
  const registry = new PlatformAdapterRegistry({});
  const adapter = registry.getAdapter('抖音');

  const error1 = adapter.mapApiError(new Error('TIMEOUT occurred'));
  assert.strictEqual(error1.code, 'TIMEOUT');
  assert.ok(error1.message.includes('超时'));

  const error2 = adapter.mapApiError(new Error('ETIMEDOUT'));
  assert.strictEqual(error2.code, 'TIMEOUT');

  const error3 = adapter.mapApiError(new Error('ECONNABORTED'));
  assert.strictEqual(error3.code, 'TIMEOUT');
});

test('mapApiError correctly maps CAPTCHA_REQUIRED errors', () => {
  const registry = new PlatformAdapterRegistry({});
  const adapter = registry.getAdapter('抖音');

  const error1 = adapter.mapApiError(new Error('CAPTCHA required'));
  assert.strictEqual(error1.code, 'CAPTCHA_REQUIRED');
  assert.ok(error1.message.includes('验证码'));

  const error2 = adapter.mapApiError(new Error('VERIFY needed'));
  assert.strictEqual(error2.code, 'CAPTCHA_REQUIRED');

  const error3 = adapter.mapApiError(new Error('需要验证码'));
  assert.strictEqual(error3.code, 'CAPTCHA_REQUIRED');
});

test('mapApiError correctly maps CONTENT_VIOLATION errors', () => {
  const registry = new PlatformAdapterRegistry({});
  const adapter = registry.getAdapter('抖音');

  const error1 = adapter.mapApiError(new Error('CONTENT_VIOLATION detected'));
  assert.strictEqual(error1.code, 'CONTENT_VIOLATION');
  assert.ok(error1.message.includes('违规'));

  const error2 = adapter.mapApiError(new Error('SENSITIVE content'));
  assert.strictEqual(error2.code, 'CONTENT_VIOLATION');

  const error3 = adapter.mapApiError(new Error('内容违规'));
  assert.strictEqual(error3.code, 'CONTENT_VIOLATION');

  const error4 = adapter.mapApiError(new Error('敏感词'));
  assert.strictEqual(error4.code, 'CONTENT_VIOLATION');
});

test('mapApiError returns REQUEST_FAILED for unknown errors', () => {
  const registry = new PlatformAdapterRegistry({});
  const adapter = registry.getAdapter('抖音');

  const error = adapter.mapApiError(new Error('Unknown error occurred'));
  assert.strictEqual(error.code, 'REQUEST_FAILED');
  assert.ok(error.message.includes('平台请求失败'));
});

test('mapApiError handles string errors', () => {
  const registry = new PlatformAdapterRegistry({});
  const adapter = registry.getAdapter('抖音');

  const error = adapter.mapApiError('AUTH failed');
  assert.strictEqual(error.code, 'AUTH_FAILED');
  assert.ok(error instanceof PlatformApiError);
});

// DouyinAdapter publishImageText tests
test('DouyinAdapter publishImageText works in mock mode', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const result = await adapter.publishImageText({
    account: { accountId: 'test-account' },
    contentAsset: {
      title: '测试标题',
      body: '测试正文内容',
      images: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.platform, '抖音');
  assert.strictEqual(result.contentType, 'image-text');
  assert.ok(result.remoteId.startsWith('dy_imagetext_'));
});

test('DouyinAdapter publishImageText validates content compliance', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Test with sensitive words
  await assert.rejects(
    async () => {
      await adapter.publishImageText({
        account: { accountId: 'test-account' },
        contentAsset: {
          title: '包含违禁词的标题',
          body: '正文内容',
          images: ['https://example.com/image1.jpg'],
        },
      });
    },
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'CONTENT_VIOLATION' &&
        err.message.includes('敏感词');
    }
  );
});

test('DouyinAdapter publishImageText validates title length', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Title exceeds 55 characters
  const longTitle = '这是一个非常长的标题'.repeat(10);

  await assert.rejects(
    async () => {
      await adapter.publishImageText({
        account: { accountId: 'test-account' },
        contentAsset: {
          title: longTitle,
          body: '正文内容',
          images: ['https://example.com/image1.jpg'],
        },
      });
    },
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'INVALID_PAYLOAD' &&
        err.message.includes('标题长度超过限制');
    }
  );
});

test('DouyinAdapter publishImageText validates body length', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Body exceeds 2000 characters
  const longBody = '这是正文内容。'.repeat(300);

  await assert.rejects(
    async () => {
      await adapter.publishImageText({
        account: { accountId: 'test-account' },
        contentAsset: {
          title: '标题',
          body: longBody,
          images: ['https://example.com/image1.jpg'],
        },
      });
    },
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'INVALID_PAYLOAD' &&
        err.message.includes('正文长度超过限制');
    }
  );
});

test('DouyinAdapter publishImageText validates image count', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Too many images (more than 9)
  const tooManyImages = Array(10).fill('https://example.com/image.jpg');

  await assert.rejects(
    async () => {
      await adapter.publishImageText({
        account: { accountId: 'test-account' },
        contentAsset: {
          title: '标题',
          body: '正文',
          images: tooManyImages,
        },
      });
    },
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'INVALID_PAYLOAD' &&
        err.message.includes('图片数量超过限制');
    }
  );
});

test('DouyinAdapter publishImageText requires at least one image', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  await assert.rejects(
    async () => {
      await adapter.publishImageText({
        account: { accountId: 'test-account' },
        contentAsset: {
          title: '标题',
          body: '正文',
          images: [],
        },
      });
    },
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'INVALID_PAYLOAD' &&
        err.message.includes('图片数量不足');
    }
  );
});

test('DouyinAdapter publishImageText handles authentication', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Ensure token is not set initially
  adapter.accessToken = null;
  adapter.tokenExpiresAt = null;

  const result = await adapter.publishImageText({
    account: { accountId: 'test-account' },
    contentAsset: {
      title: '测试标题',
      body: '测试正文',
      images: ['https://example.com/image1.jpg'],
    },
  });

  // Should authenticate automatically
  assert.ok(adapter.accessToken);
  assert.ok(adapter.tokenExpiresAt);
  assert.strictEqual(result.ok, true);
});

test('DouyinAdapter publish routes image-text content correctly', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const result = await adapter.publish({
    account: { accountId: 'test-account' },
    contentType: 'image-text',
    contentAsset: {
      title: '测试标题',
      body: '测试正文',
      images: ['https://example.com/image1.jpg'],
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.contentType, 'image-text');
});

test('DouyinAdapter publish routes 图文 content correctly', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const result = await adapter.publish({
    account: { accountId: 'test-account' },
    contentType: '图文',
    contentAsset: {
      title: '测试标题',
      body: '测试正文',
      images: ['https://example.com/image1.jpg'],
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.contentType, 'image-text');
});

// DouyinAdapter publishVideo tests
test('DouyinAdapter publishVideo works in mock mode', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const result = await adapter.publishVideo({
    account: { accountId: 'test-account' },
    contentAsset: {
      title: '测试视频标题',
      body: '测试视频描述',
      videoUrl: 'https://example.com/video.mp4',
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.platform, '抖音');
  assert.strictEqual(result.contentType, 'video');
  assert.ok(result.remoteId.startsWith('dy_video_'));
});

test('DouyinAdapter publishVideo validates content compliance', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Test with sensitive words
  await assert.rejects(
    async () => {
      await adapter.publishVideo({
        account: { accountId: 'test-account' },
        contentAsset: {
          title: '包含违禁词的视频标题',
          body: '视频描述',
          videoUrl: 'https://example.com/video.mp4',
        },
      });
    },
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'CONTENT_VIOLATION' &&
        err.message.includes('敏感词');
    }
  );
});

test('DouyinAdapter publishVideo requires videoUrl', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  await assert.rejects(
    async () => {
      await adapter.publishVideo({
        account: { accountId: 'test-account' },
        contentAsset: {
          title: '视频标题',
          body: '视频描述',
          // Missing videoUrl
        },
      });
    },
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'INVALID_PAYLOAD' &&
        err.message.includes('videoUrl');
    }
  );
});

test('DouyinAdapter publishVideo validates title length', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Title exceeds 55 characters
  const longTitle = '这是一个非常长的视频标题'.repeat(10);

  await assert.rejects(
    async () => {
      await adapter.publishVideo({
        account: { accountId: 'test-account' },
        contentAsset: {
          title: longTitle,
          body: '视频描述',
          videoUrl: 'https://example.com/video.mp4',
        },
      });
    },
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'INVALID_PAYLOAD' &&
        err.message.includes('标题长度超过限制');
    }
  );
});

test('DouyinAdapter publishVideo validates body length', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Body exceeds 2000 characters
  const longBody = '这是视频描述内容。'.repeat(300);

  await assert.rejects(
    async () => {
      await adapter.publishVideo({
        account: { accountId: 'test-account' },
        contentAsset: {
          title: '视频标题',
          body: longBody,
          videoUrl: 'https://example.com/video.mp4',
        },
      });
    },
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'INVALID_PAYLOAD' &&
        err.message.includes('正文长度超过限制');
    }
  );
});

test('DouyinAdapter publishVideo handles authentication', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Ensure token is not set initially
  adapter.accessToken = null;
  adapter.tokenExpiresAt = null;

  const result = await adapter.publishVideo({
    account: { accountId: 'test-account' },
    contentAsset: {
      title: '测试视频标题',
      body: '测试视频描述',
      videoUrl: 'https://example.com/video.mp4',
    },
  });

  // Should authenticate automatically
  assert.ok(adapter.accessToken);
  assert.ok(adapter.tokenExpiresAt);
  assert.strictEqual(result.ok, true);
});

test('DouyinAdapter publishVideo supports optional cover image', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const result = await adapter.publishVideo({
    account: { accountId: 'test-account' },
    contentAsset: {
      title: '测试视频标题',
      body: '测试视频描述',
      videoUrl: 'https://example.com/video.mp4',
      coverUrl: 'https://example.com/cover.jpg',
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.contentType, 'video');
});

test('DouyinAdapter publish routes video content correctly', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const result = await adapter.publish({
    account: { accountId: 'test-account' },
    contentType: 'video',
    contentAsset: {
      title: '测试视频标题',
      body: '测试视频描述',
      videoUrl: 'https://example.com/video.mp4',
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.contentType, 'video');
});

test('DouyinAdapter publish routes 视频 content correctly', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const result = await adapter.publish({
    account: { accountId: 'test-account' },
    contentType: '视频',
    contentAsset: {
      title: '测试视频标题',
      body: '测试视频描述',
      videoUrl: 'https://example.com/video.mp4',
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.contentType, 'video');
});

test('DouyinAdapter uploadVideo returns mock video ID in mock mode', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const videoId = await adapter.uploadVideo('https://example.com/video.mp4');

  assert.ok(videoId.startsWith('mock_video_'));
  assert.ok(videoId.length > 11); // mock_video_ + timestamp + random
});

// ============================================
// DouyinAdapter Authentication Tests
// ============================================

test('DouyinAdapter authenticate generates mock token in mock mode', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Clear any existing token
  adapter.accessToken = null;
  adapter.tokenExpiresAt = 0;

  await adapter.authenticate();

  assert.ok(adapter.accessToken);
  assert.ok(adapter.accessToken.startsWith('mock_token_'));
  assert.ok(adapter.tokenExpiresAt > Date.now());
  assert.ok(adapter.tokenExpiresAt < Date.now() + 7200 * 1000 + 1000); // Within 2 hours + 1s buffer
});

test('DouyinAdapter isTokenValid returns false when token is null', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  adapter.accessToken = null;
  adapter.tokenExpiresAt = Date.now() + 1000;

  assert.strictEqual(adapter.isTokenValid(), false);
});

test('DouyinAdapter isTokenValid returns false when token is expired', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  adapter.accessToken = 'test_token';
  adapter.tokenExpiresAt = Date.now() - 1000; // Expired 1 second ago

  assert.strictEqual(adapter.isTokenValid(), false);
});

test('DouyinAdapter isTokenValid returns true when token is valid', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  adapter.accessToken = 'test_token';
  adapter.tokenExpiresAt = Date.now() + 1000; // Expires in 1 second

  assert.strictEqual(adapter.isTokenValid(), true);
});

test('DouyinAdapter ensureAuthenticated does not re-authenticate when token is valid', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Set a valid token
  const originalToken = 'original_token';
  adapter.accessToken = originalToken;
  adapter.tokenExpiresAt = Date.now() + 10000;

  await adapter.ensureAuthenticated();

  // Token should remain unchanged
  assert.strictEqual(adapter.accessToken, originalToken);
});

test('DouyinAdapter ensureAuthenticated re-authenticates when token is expired', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Set an expired token
  adapter.accessToken = 'expired_token';
  adapter.tokenExpiresAt = Date.now() - 1000;

  await adapter.ensureAuthenticated();

  // Token should be refreshed
  assert.notStrictEqual(adapter.accessToken, 'expired_token');
  assert.ok(adapter.accessToken.startsWith('mock_token_'));
});

test('DouyinAdapter ensureAuthenticated authenticates when token is null', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Clear token
  adapter.accessToken = null;
  adapter.tokenExpiresAt = 0;

  await adapter.ensureAuthenticated();

  // Token should be set
  assert.ok(adapter.accessToken);
  assert.ok(adapter.accessToken.startsWith('mock_token_'));
});

// ============================================
// DouyinAdapter Error Handling Tests
// ============================================

test('DouyinAdapter mapDouyinError maps authentication error codes', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const authErrorCodes = [2190001, 2190002, 2190003, 2190004, 2190008];

  for (const errorCode of authErrorCodes) {
    const error = adapter.mapDouyinError({
      error_code: errorCode,
      description: 'Authentication failed',
    });

    assert.strictEqual(error.code, PlatformApiError.AUTH_FAILED);
    assert.ok(error.message.includes('鉴权失败'));
  }
});

test('DouyinAdapter mapDouyinError maps rate limit error codes', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const rateLimitErrorCodes = [2190015, 2100002];

  for (const errorCode of rateLimitErrorCodes) {
    const error = adapter.mapDouyinError({
      error_code: errorCode,
      description: 'Rate limit exceeded',
    });

    assert.strictEqual(error.code, PlatformApiError.RATE_LIMIT);
    assert.ok(error.message.includes('频率超限'));
  }
});

test('DouyinAdapter mapDouyinError maps invalid payload error codes', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const invalidPayloadErrorCodes = [2190005, 2190006, 2190007, 10002];

  for (const errorCode of invalidPayloadErrorCodes) {
    const error = adapter.mapDouyinError({
      error_code: errorCode,
      description: 'Invalid parameter',
    });

    assert.strictEqual(error.code, PlatformApiError.INVALID_PAYLOAD);
    assert.ok(error.message.includes('参数无效'));
  }
});

test('DouyinAdapter mapDouyinError maps content violation error codes', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const contentViolationErrorCodes = [2190016, 2190017, 2190018];

  for (const errorCode of contentViolationErrorCodes) {
    const error = adapter.mapDouyinError({
      error_code: errorCode,
      description: 'Content violation',
    });

    assert.strictEqual(error.code, PlatformApiError.CONTENT_VIOLATION);
    assert.ok(error.message.includes('违规'));
  }
});

test('DouyinAdapter mapDouyinError detects captcha requirement from message', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const captchaMessages = [
    { description: '需要验证码' },
    { description: 'captcha required' },
    { description: 'verify your account' },
  ];

  for (const errorData of captchaMessages) {
    const error = adapter.mapDouyinError(errorData);

    assert.strictEqual(error.code, PlatformApiError.CAPTCHA_REQUIRED);
    assert.ok(error.message.includes('验证码'));
  }
});

test('DouyinAdapter mapDouyinError falls back to base error mapping for unknown codes', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const error = adapter.mapDouyinError({
    error_code: 9999999,
    description: 'Unknown error',
  });

  // Should use base class mapping
  assert.ok(error instanceof PlatformApiError);
  assert.ok(error.message.includes('Unknown error'));
});

test('DouyinAdapter mapDouyinError handles missing error_code', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const error = adapter.mapDouyinError({
    message: 'Some error message',
  });

  assert.ok(error instanceof PlatformApiError);
});

test('DouyinAdapter mapDouyinError uses code field as fallback', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const error = adapter.mapDouyinError({
    code: 2190001,
    message: 'Auth failed',
  });

  assert.strictEqual(error.code, PlatformApiError.AUTH_FAILED);
});

// ============================================
// DouyinAdapter Rate Limiting Tests
// ============================================

test('DouyinAdapter enforceRateLimit delays execution', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const minInterval = 500;
  adapter.lastRunAt = Date.now();

  const startTime = Date.now();
  await adapter.enforceRateLimit(minInterval);
  const endTime = Date.now();

  const elapsed = endTime - startTime;
  // Should wait approximately minInterval ms (with some tolerance)
  assert.ok(elapsed >= minInterval - 50); // Allow 50ms tolerance
});

test('DouyinAdapter enforceRateLimit does not delay when enough time has passed', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const minInterval = 500;
  adapter.lastRunAt = Date.now() - 1000; // 1 second ago

  const startTime = Date.now();
  await adapter.enforceRateLimit(minInterval);
  const endTime = Date.now();

  const elapsed = endTime - startTime;
  // Should not wait since enough time has passed
  assert.ok(elapsed < 100); // Should be nearly instant
});

test('DouyinAdapter enforceRateLimit updates lastRunAt', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const originalLastRunAt = adapter.lastRunAt;
  await adapter.enforceRateLimit(100);

  assert.ok(adapter.lastRunAt > originalLastRunAt);
  assert.ok(adapter.lastRunAt <= Date.now());
});

test('DouyinAdapter publish enforces rate limit', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Set lastRunAt to now
  adapter.lastRunAt = Date.now();

  const startTime = Date.now();
  await adapter.publish({
    account: { accountId: 'test-account' },
    contentType: 'image-text',
    contentAsset: {
      title: '测试',
      body: '测试内容',
      images: ['https://example.com/image.jpg'],
    },
  });
  const endTime = Date.now();

  const elapsed = endTime - startTime;
  // Should wait at least 500ms due to rate limiting
  assert.ok(elapsed >= 450); // Allow some tolerance
});

// ============================================
// DouyinAdapter Image Upload Tests
// ============================================

test('DouyinAdapter uploadImage returns mock ID in mock mode', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const imageId = await adapter.uploadImage('https://example.com/image.jpg');

  assert.ok(imageId.startsWith('mock_image_'));
  assert.ok(imageId.length > 11); // mock_image_ + timestamp + random
});

test('DouyinAdapter uploadImage generates unique IDs', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const imageId1 = await adapter.uploadImage('https://example.com/image1.jpg');
  const imageId2 = await adapter.uploadImage('https://example.com/image2.jpg');

  assert.notStrictEqual(imageId1, imageId2);
});

// ============================================
// DouyinAdapter Integration Tests
// ============================================

test('DouyinAdapter publish handles authentication automatically', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Clear token to force authentication
  adapter.accessToken = null;
  adapter.tokenExpiresAt = 0;

  const result = await adapter.publish({
    account: { accountId: 'test-account' },
    contentType: 'image-text',
    contentAsset: {
      title: '测试标题',
      body: '测试内容',
      images: ['https://example.com/image.jpg'],
    },
  });

  // Should authenticate and publish successfully
  assert.ok(adapter.accessToken);
  assert.strictEqual(result.ok, true);
});

test('DouyinAdapter publish validates content before publishing', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Test with content that will fail validation
  await assert.rejects(
    async () => {
      await adapter.publish({
        account: { accountId: 'test-account' },
        contentType: 'image-text',
        contentAsset: {
          title: '包含违禁词的标题',
          body: '测试内容',
          images: ['https://example.com/image.jpg'],
        },
      });
    },
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'CONTENT_VIOLATION';
    }
  );
});

test('DouyinAdapter handles multiple publish calls with rate limiting', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const startTime = Date.now();

  // Make 3 publish calls
  await adapter.publish({
    account: { accountId: 'test-account' },
    contentType: 'image-text',
    contentAsset: {
      title: '测试1',
      body: '内容1',
      images: ['https://example.com/image1.jpg'],
    },
  });

  await adapter.publish({
    account: { accountId: 'test-account' },
    contentType: 'image-text',
    contentAsset: {
      title: '测试2',
      body: '内容2',
      images: ['https://example.com/image2.jpg'],
    },
  });

  await adapter.publish({
    account: { accountId: 'test-account' },
    contentType: 'image-text',
    contentAsset: {
      title: '测试3',
      body: '内容3',
      images: ['https://example.com/image3.jpg'],
    },
  });

  const endTime = Date.now();
  const elapsed = endTime - startTime;

  // Should take at least 1000ms (2 * 500ms rate limit)
  assert.ok(elapsed >= 900); // Allow some tolerance
});

test('DouyinAdapter publishImageText works with minimal content', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const result = await adapter.publishImageText({
    account: { accountId: 'test-account' },
    contentAsset: {
      title: '标题',
      body: '内容',
      images: ['https://example.com/image.jpg'],
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.platform, '抖音');
  assert.strictEqual(result.contentType, 'image-text');
});

test('DouyinAdapter publishImageText works with maximum allowed images', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // 9 images is the maximum
  const images = Array(9).fill('https://example.com/image.jpg').map((url, i) => `${url}?id=${i}`);

  const result = await adapter.publishImageText({
    account: { accountId: 'test-account' },
    contentAsset: {
      title: '标题',
      body: '内容',
      images,
    },
  });

  assert.strictEqual(result.ok, true);
});

test('DouyinAdapter publishVideo works with minimal content', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const result = await adapter.publishVideo({
    account: { accountId: 'test-account' },
    contentAsset: {
      title: '视频标题',
      body: '视频描述',
      videoUrl: 'https://example.com/video.mp4',
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.platform, '抖音');
  assert.strictEqual(result.contentType, 'video');
});

test('DouyinAdapter publishVideo works without title', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const result = await adapter.publishVideo({
    account: { accountId: 'test-account' },
    contentAsset: {
      body: '视频描述',
      videoUrl: 'https://example.com/video.mp4',
    },
  });

  assert.strictEqual(result.ok, true);
});

test('DouyinAdapter publishVideo works without body', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const result = await adapter.publishVideo({
    account: { accountId: 'test-account' },
    contentAsset: {
      title: '视频标题',
      videoUrl: 'https://example.com/video.mp4',
    },
  });

  assert.strictEqual(result.ok, true);
});

// ============================================
// DouyinAdapter Legacy Publish Method Tests
// ============================================

test('DouyinAdapter publish handles legacy content types', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const result = await adapter.publish({
    account: { accountId: 'test-account' },
    contentType: '其他类型',
    contentAsset: {
      title: '测试',
      body: '内容',
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.platform, '抖音');
  assert.ok(result.remoteId.startsWith('dy-'));
});

test('DouyinAdapter publish throws error for simulated auth failure', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  await assert.rejects(
    async () => {
      await adapter.publish({
        account: { accountId: 'test-account' },
        contentType: '模拟鉴权失败',
        contentAsset: {},
      });
    },
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === 'AUTH_FAILED';
    }
  );
});

// ============================================
// DouyinAdapter Configuration Tests
// ============================================

test('DouyinAdapter uses DOUYIN_ prefixed environment variables', () => {
  // Save original env vars
  const originalAppId = process.env.DOUYIN_APP_ID;
  const originalAppSecret = process.env.DOUYIN_APP_SECRET;
  const originalMode = process.env.DOUYIN_MODE;

  try {
    // Set test env vars
    process.env.DOUYIN_APP_ID = 'test-douyin-app-id';
    process.env.DOUYIN_APP_SECRET = 'test-douyin-secret';
    process.env.DOUYIN_MODE = 'mock';

    const registry = new PlatformAdapterRegistry({});
    const adapter = registry.getAdapter('抖音');

    assert.strictEqual(adapter.appId, 'test-douyin-app-id');
    assert.strictEqual(adapter.appSecret, 'test-douyin-secret');
    assert.strictEqual(adapter.mode, 'mock');
  } finally {
    // Restore original env vars
    if (originalAppId !== undefined) {
      process.env.DOUYIN_APP_ID = originalAppId;
    } else {
      delete process.env.DOUYIN_APP_ID;
    }
    if (originalAppSecret !== undefined) {
      process.env.DOUYIN_APP_SECRET = originalAppSecret;
    } else {
      delete process.env.DOUYIN_APP_SECRET;
    }
    if (originalMode !== undefined) {
      process.env.DOUYIN_MODE = originalMode;
    } else {
      delete process.env.DOUYIN_MODE;
    }
  }
});

test('DouyinAdapter constructor config overrides environment variables', () => {
  // Save original env vars
  const originalAppId = process.env.DOUYIN_APP_ID;

  try {
    // Set env var
    process.env.DOUYIN_APP_ID = 'env-app-id';

    const registry = new PlatformAdapterRegistry({
      抖音: { appId: 'config-app-id' },
    });
    const adapter = registry.getAdapter('抖音');

    // Config should override env var
    assert.strictEqual(adapter.appId, 'config-app-id');
  } finally {
    // Restore original env var
    if (originalAppId !== undefined) {
      process.env.DOUYIN_APP_ID = originalAppId;
    } else {
      delete process.env.DOUYIN_APP_ID;
    }
  }
});

test('DouyinAdapter has default authUrl', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  assert.strictEqual(adapter.authUrl, 'https://open.douyin.com/oauth/access_token');
});

test('DouyinAdapter authUrl can be configured', () => {
  const customAuthUrl = 'https://custom.auth.url/token';
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock', authUrl: customAuthUrl },
  });
  const adapter = registry.getAdapter('抖音');

  assert.strictEqual(adapter.authUrl, customAuthUrl);
});
