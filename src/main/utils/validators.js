export function ensureObject(payload, name = 'payload') {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${name} must be an object`);
  }
}

export function ensureString(value, field, { required = true } = {}) {
  if (!required && (value === undefined || value === null || value === '')) return;
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
}

export function validateAddAccountPayload(payload) {
  ensureObject(payload);
  ensureString(payload.platform, 'platform');
  ensureString(payload.nickname, 'nickname');
}

export function validateGenerateContentPayload(payload) {
  ensureObject(payload);
  ensureString(payload.hotspotId, 'hotspotId');
  ensureString(payload.type, 'type', { required: false });
  ensureString(payload.tone, 'tone', { required: false });
}

export function validateSchedulePayload(payload) {
  ensureObject(payload);
  ensureString(payload.accountId, 'accountId');
  ensureString(payload.contentType, 'contentType');
  ensureString(payload.publishAt, 'publishAt');
}

export function validateNavigatePayload(payload) {
  ensureObject(payload);
  ensureString(payload.id, 'id');
  ensureString(payload.url, 'url');
}
