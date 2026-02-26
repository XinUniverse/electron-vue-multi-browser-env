export class AlertReporter {
  constructor({ webhookUrl = '' } = {}) {
    this.webhookUrl = webhookUrl;
  }

  isEnabled() {
    return Boolean(this.webhookUrl);
  }

  async notify(payload) {
    if (!this.isEnabled()) return { ok: false, skipped: true };

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`alert webhook failed: ${response.status}`);
    }

    return { ok: true };
  }
}
