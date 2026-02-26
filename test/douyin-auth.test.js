import test from 'node:test';
import assert from 'node:assert/strict';
import { PlatformAdapterRegistry, PlatformApiError } from '../src/main/services/platform-adapters.js';

test('DouyinAdapter authenticate() in mock mode generates token', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Initially no token
  assert.strictEqual(adapter.accessToken, null);
  assert.strictEqual(adapter.tokenExpiresAt, 0);

  // Authenticate
  await adapter.authenticate();

  // Token should be generated
  assert.ok(adapter.accessToken);
  assert.ok(adapter.accessToken.startsWith('mock_token_'));
  assert.ok(adapter.tokenExpiresAt > Date.now());
});

test('DouyinAdapter isTokenValid() checks token expiration', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // No token initially
  assert.strictEqual(adapter.isTokenValid(), false);

  // Authenticate
  await adapter.authenticate();

  // Token should be valid
  assert.strictEqual(adapter.isTokenValid(), true);

  // Manually expire the token
  adapter.tokenExpiresAt = Date.now() - 1000;

  // Token should be invalid
  assert.strictEqual(adapter.isTokenValid(), false);
});

test('DouyinAdapter ensureAuthenticated() calls authenticate when needed', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // No token initially
  assert.strictEqual(adapter.accessToken, null);

  // Ensure authenticated
  await adapter.ensureAuthenticated();

  // Token should be generated
  assert.ok(adapter.accessToken);
  assert.ok(adapter.isTokenValid());

  // Save the token expiry time
  const firstExpiresAt = adapter.tokenExpiresAt;

  // Call again - should not regenerate token (expiry time stays the same)
  await adapter.ensureAuthenticated();
  assert.strictEqual(adapter.tokenExpiresAt, firstExpiresAt);

  // Expire the token
  adapter.tokenExpiresAt = Date.now() - 1000;
  assert.strictEqual(adapter.isTokenValid(), false);

  // Wait a bit to ensure different timestamp
  await new Promise(resolve => setTimeout(resolve, 10));

  // Call again - should regenerate token
  await adapter.ensureAuthenticated();
  assert.ok(adapter.isTokenValid());
  assert.ok(adapter.tokenExpiresAt > Date.now());
});

test('DouyinAdapter publish() calls ensureAuthenticated', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // No token initially
  assert.strictEqual(adapter.accessToken, null);

  // Publish should trigger authentication
  const result = await adapter.publish({
    account: { id: 'test-account' },
    contentType: '图文',
    contentAsset: { title: 'Test' },
  });

  // Token should be generated
  assert.ok(adapter.accessToken);
  assert.ok(result.ok);
  assert.ok(result.remoteId.startsWith('dy-'));
});

test('DouyinAdapter constructor sets authUrl with default', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  assert.strictEqual(adapter.authUrl, 'https://open.douyin.com/oauth/access_token');
});

test('DouyinAdapter constructor accepts custom authUrl', () => {
  const registry = new PlatformAdapterRegistry({
    抖音: {
      mode: 'mock',
      authUrl: 'https://custom.auth.url',
    },
  });
  const adapter = registry.getAdapter('抖音');

  assert.strictEqual(adapter.authUrl, 'https://custom.auth.url');
});

test('DouyinAdapter refreshAccessToken() in mock mode calls authenticate', async () => {
  const registry = new PlatformAdapterRegistry({
    抖音: { mode: 'mock' },
  });
  const adapter = registry.getAdapter('抖音');

  // Authenticate first
  await adapter.authenticate();
  const firstToken = adapter.accessToken;

  // Wait a bit to ensure different timestamp
  await new Promise(resolve => setTimeout(resolve, 10));

  // Refresh should generate new token in mock mode
  await adapter.refreshAccessToken();
  assert.notStrictEqual(adapter.accessToken, firstToken);
  assert.ok(adapter.isTokenValid());
});
