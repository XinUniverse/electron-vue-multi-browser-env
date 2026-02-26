function hasValue(input) {
  return typeof input === 'string' && input.trim().length > 0;
}

export class AlertReporter {
  constructor({ webhookUrl = '', wecomWebhookUrl = '', feishuWebhookUrl = '' } = {}) {
    this.webhookUrl = webhookUrl;
    this.wecomWebhookUrl = wecomWebhookUrl;
    this.feishuWebhookUrl = feishuWebhookUrl;
  }

  isEnabled() {
    return hasValue(this.webhookUrl) || hasValue(this.wecomWebhookUrl) || hasValue(this.feishuWebhookUrl);
  }

  async post(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`alert webhook failed: ${response.status}`);
    }
  }

  async notify(payload) {
    if (!this.isEnabled()) return { ok: false, skipped: true };

    const jobs = [];

    if (hasValue(this.webhookUrl)) {
      jobs.push(this.post(this.webhookUrl, payload));
    }

    if (hasValue(this.wecomWebhookUrl)) {
      jobs.push(this.post(this.wecomWebhookUrl, {
        msgtype: 'text',
        text: { content: `[MatrixAlert] ${payload.event}\n${JSON.stringify(payload.details || {})}` },
      }));
    }

    if (hasValue(this.feishuWebhookUrl)) {
      jobs.push(this.post(this.feishuWebhookUrl, {
        msg_type: 'text',
        content: { text: `[MatrixAlert] ${payload.event}\n${JSON.stringify(payload.details || {})}` },
      }));
    }

    await Promise.all(jobs);
    return { ok: true, channels: jobs.length };
  }
}
