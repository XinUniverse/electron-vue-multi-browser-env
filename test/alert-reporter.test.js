import test from 'node:test';
import assert from 'node:assert/strict';
import { AlertReporter } from '../src/main/services/alert-reporter.js';

test('alert reporter skips when webhook is disabled', async () => {
  const reporter = new AlertReporter();
  const result = await reporter.notify({ msg: 'hello' });
  assert.equal(result.skipped, true);
});

test('alert reporter posts payload when webhook enabled', async () => {
  const calls = [];
  const originFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  };

  try {
    const reporter = new AlertReporter({ webhookUrl: 'https://example.test/hook' });
    const result = await reporter.notify({ event: 'x' });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://example.test/hook');
  } finally {
    globalThis.fetch = originFetch;
  }
});
