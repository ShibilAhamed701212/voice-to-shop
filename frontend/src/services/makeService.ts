import { MakeWebhookResponse } from '../types';

export class MakeService {
  private sessionId: string;
  private webhookUrl: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.webhookUrl = import.meta.env.VITE_MAKE_WEBHOOK_URL || '';
  }

  private generateSessionId(): string {
    // Basic UUID-like generation for demo
    return 'sess_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public getWebhookUrl(): string {
    return this.webhookUrl;
  }

  public resetSession(): void {
    this.sessionId = this.generateSessionId();
  }

  public setWebhookUrl(url: string): void {
    this.webhookUrl = url;
  }

  public async sendMessage(
    message: string,
    _useSimulator: boolean = false,
    language: string = 'en-IN'
  ): Promise<MakeWebhookResponse> {
    const payload = {
      session_id: this.sessionId,
      customer_id: 'cust_789',
      message,
      input_type: 'voice',
      language
    };

    const targetUrl = 'https://hook.eu1.make.com/d7tmacjwxzhxxrwqvo2nm71ozki238na';

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data: MakeWebhookResponse = await response.json();
      return data;
    } catch (err: any) {
      console.error('Make Webhook error:', err);
      return {
        session_id: this.sessionId,
        response_type: 'voice',
        text: "I'm having trouble connecting to the booking server. Please check that the server is running.",
        error: err.message
      };
    }
  }
}

export const makeService = new MakeService();
