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

export function validateUpdateAccountPayload(payload) {
  ensureObject(payload);
  ensureString(payload.id, 'id');
  ensureString(payload.status, 'status');
}

export function validateDeleteAccountPayload(payload) {
  ensureObject(payload);
  ensureString(payload.id, 'id');
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
  ensureString(payload.contentAssetId, 'contentAssetId', { required: false });
}

export function validateNavigatePayload(payload) {
  ensureObject(payload);
  ensureString(payload.id, 'id');
  ensureString(payload.url, 'url');
}

export function validateTaskActionPayload(payload) {
  ensureObject(payload);
  ensureString(payload.id, 'id');
}

export function validateListQueryPayload(payload) {
  ensureObject(payload);
  if (payload.limit !== undefined) {
    if (typeof payload.limit !== 'number' || !Number.isInteger(payload.limit) || payload.limit <= 0 || payload.limit > 500) {
      throw new Error('limit must be an integer between 1 and 500');
    }
  }
}

export function validateContentAssetPayload(payload) {
  ensureObject(payload);
  ensureString(payload.id, 'id');
  ensureString(payload.hotspotId, 'hotspotId');
  ensureString(payload.type, 'type');
  ensureString(payload.tone, 'tone');
  ensureString(payload.title, 'title');
  ensureString(payload.body, 'body');
  ensureString(payload.createdAt, 'createdAt');
}

export function validateDeleteContentAssetPayload(payload) {
  ensureObject(payload);
  ensureString(payload.id, 'id');
}

export function validateImportSnapshotPayload(payload) {
  ensureObject(payload);
  ensureObject(payload.snapshot, 'snapshot');
  ensureString(payload.mode, 'mode', { required: false });
  if (payload.mode && !['merge', 'replace'].includes(payload.mode)) {
    throw new Error('mode must be merge or replace');
  }
}
