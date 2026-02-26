import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAddAccountPayload,
  validateGenerateContentPayload,
  validateNavigatePayload,
  validateSchedulePayload,
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
