import test from 'node:test';
import assert from 'node:assert/strict';
import { AlertReporter } from '../src/main/services/alert-reporter.js';

test('alert reporter skips when no channels configured', async () => {
  const reporter = new AlertReporter();
  const result = await reporter.notify({ msg: 'hello' });
  assert.equal(result.skipped, true);
});

test('alert reporter posts payload when generic webhook enabled', async () => {
  const calls = [];
  const originFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options: JSON.parse(options.body) });
    return { ok: true, status: 200 };
  };

  try {
    const reporter = new AlertReporter({ webhookUrl: 'https://example.test/hook' });
    const result = await reporter.notify({ event: 'x', details: { a: 1 } });
    assert.equal(result.ok, true);
    assert.equal(result.channels, 1);
    assert.equal(calls[0].url, 'https://example.test/hook');
    assert.equal(calls[0].options.event, 'x');
  } finally {
    globalThis.fetch = originFetch;
  }
});

test('alert reporter fan-outs to wecom and feishu channels', async () => {
  const calls = [];
  const originFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200 };
  };

  try {
    const reporter = new AlertReporter({
      wecomWebhookUrl: 'https://wecom.test/hook',
      feishuWebhookUrl: 'https://feishu.test/hook',
    });
    const result = await reporter.notify({ event: 'publish_failed', details: { taskId: 't1' } });
    assert.equal(result.ok, true);
    assert.equal(result.channels, 2);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://wecom.test/hook');
    assert.equal(calls[1].url, 'https://feishu.test/hook');
    assert.equal(calls[0].body.msgtype, 'text');
    assert.equal(calls[1].body.msg_type, 'text');
  } finally {
    globalThis.fetch = originFetch;
  }
});
