import test from 'node:test';
import assert from 'node:assert/strict';
import { PlatformAdapterRegistry } from '../src/main/services/platform-adapters.js';

test('DouyinAdapter publishImageText works in mock mode', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const result = await adapter.publishImageText({
    account: { accountId: 'test-account', openId: 'test-open-id' },
    contentAsset: {
      title: '测试标题',
      body: '测试正文内容',
      images: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.platform, '抖音');
  assert.ok(result.remoteId.startsWith('dy_imagetext_'));
  assert.strictEqual(result.contentType, 'image-text');
});

test('DouyinAdapter publish routes to publishImageText for image-text content', async () => {
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
      images: ['https://example.com/image.jpg'],
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.contentType, 'image-text');
});

test('DouyinAdapter publish routes to publishImageText for 图文 content', async () => {
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
      images: ['https://example.com/image.jpg'],
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.contentType, 'image-text');
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
          body: '测试正文',
          images: ['https://example.com/image.jpg'],
        },
      });
    },
    (err) => {
      return err.code === 'CONTENT_VIOLATION' && err.message.includes('敏感词');
    }
  );
});

test('DouyinAdapter publishImageText validates content format', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Test with title too long
  await assert.rejects(
    async () => {
      await adapter.publishImageText({
        account: { accountId: 'test-account' },
        contentAsset: {
          title: 'a'.repeat(100), // 超过抖音55字符限制
          body: '测试正文',
          images: ['https://example.com/image.jpg'],
        },
      });
    },
    (err) => {
      return err.code === 'INVALID_PAYLOAD' && err.message.includes('标题长度');
    }
  );
});

test('DouyinAdapter publishImageText validates image count', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Test with too many images
  await assert.rejects(
    async () => {
      await adapter.publishImageText({
        account: { accountId: 'test-account' },
        contentAsset: {
          title: '测试标题',
          body: '测试正文',
          images: Array(15).fill('https://example.com/image.jpg'), // 超过9张限制
        },
      });
    },
    (err) => {
      return err.code === 'INVALID_PAYLOAD' && err.message.includes('图片数量');
    }
  );
});

test('DouyinAdapter uploadImage works in mock mode', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  const imageId = await adapter.uploadImage('https://example.com/image.jpg');
  
  assert.ok(imageId.startsWith('mock_image_'));
  assert.ok(typeof imageId === 'string');
});
