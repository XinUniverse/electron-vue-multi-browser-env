import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAddAccountPayload,
  validateDeleteAccountPayload,
  validateGenerateContentPayload,
  validateNavigatePayload,
  validateSchedulePayload,
  validateTaskActionPayload,
  validateUpdateAccountPayload,
  validateListQueryPayload,
  validateContentAssetPayload,
  validateDeleteContentAssetPayload,
  validateImportSnapshotPayload,
} from '../src/main/utils/validators.js';

test('validateAddAccountPayload accepts valid payload', () => {
  assert.doesNotThrow(() => validateAddAccountPayload({ platform: '抖音', nickname: 'demo' }));
});

test('validateAddAccountPayload rejects invalid payload', () => {
  assert.throws(() => validateAddAccountPayload({ platform: '抖音' }));
});

test('validateSchedulePayload requires all fields', () => {
  assert.throws(() => validateSchedulePayload({ accountId: 'a', contentType: '文章' }));
  assert.doesNotThrow(() => validateSchedulePayload({ accountId: 'a', contentType: '文章', publishAt: new Date().toISOString() }));
});

test('validateNavigatePayload and generate payload validation', () => {
  assert.doesNotThrow(() => validateNavigatePayload({ id: 'id-1', url: 'example.com' }));
  assert.throws(() => validateNavigatePayload({ id: 'id-1' }));

  assert.doesNotThrow(() => validateGenerateContentPayload({ hotspotId: 'h1', type: '文章', tone: '专业' }));
  assert.throws(() => validateGenerateContentPayload({ tone: '专业' }));
});

test('validate account/task action payloads', () => {
  assert.doesNotThrow(() => validateUpdateAccountPayload({ id: 'a1', status: 'active' }));
  assert.throws(() => validateUpdateAccountPayload({ status: 'active' }));
  assert.doesNotThrow(() => validateDeleteAccountPayload({ id: 'a1' }));
  assert.doesNotThrow(() => validateTaskActionPayload({ id: 't1' }));
});


test('validate list query payload', () => {
  assert.doesNotThrow(() => validateListQueryPayload({ limit: 50 }));
  assert.throws(() => validateListQueryPayload({ limit: 0 }));
  assert.throws(() => validateListQueryPayload({ limit: 999 }));
});


test('validate content asset payloads', () => {
  const payload = { id: 'c1', hotspotId: 'h1', type: '文章', tone: '专业', title: '标题', body: '正文', createdAt: new Date().toISOString() };
  assert.doesNotThrow(() => validateContentAssetPayload(payload));
  assert.throws(() => validateContentAssetPayload({ id: 'c1' }));
  assert.doesNotThrow(() => validateDeleteContentAssetPayload({ id: 'c1' }));
});


test('validate import snapshot payload', () => {
  assert.doesNotThrow(() => validateImportSnapshotPayload({ snapshot: { accounts: [] }, mode: 'merge' }));
  assert.doesNotThrow(() => validateImportSnapshotPayload({ snapshot: { accounts: [] }, mode: 'replace' }));
  assert.throws(() => validateImportSnapshotPayload({ snapshot: {}, mode: 'bad' }));
});
