import { MakeWebhookResponse } from '../types';

export class MakeService {
  private sessionId: string;
  private customerId: string;
  private webhookUrl: string;
  private mockApiUrl: string;

  constructor() {
    this.sessionId = 'S' + Math.floor(1000 + Math.random() * 9000);
    this.customerId = 'C001';
    this.webhookUrl = import.meta.env.VITE_MAKE_WEBHOOK_URL || '';
    this.mockApiUrl = import.meta.env.VITE_MOCK_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public resetSession(): void {
    this.sessionId = 'S' + Math.floor(1000 + Math.random() * 9000);
  }

  public getWebhookUrl(): string {
    return this.webhookUrl;
  }

  public setWebhookUrl(url: string): void {
    this.webhookUrl = url;
  }

  public async sendMessage(
    message: string,
    useSimulator: boolean = false,
    language: string = 'en-IN'
  ): Promise<MakeWebhookResponse> {
    const payload = {
      session_id: this.sessionId,
      customer_id: this.customerId,
      message,
      input_type: 'voice',
      language
    };

    // Determine target URL
    const targetUrl = (this.webhookUrl && !useSimulator)
      ? this.webhookUrl
      : `${this.mockApiUrl}/api/make-simulator`;

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
      // If live Make Webhook fails (e.g. CORS or network), graceful fallback to local simulator
      if (!useSimulator && this.webhookUrl) {
        console.warn('Falling back to local Make simulator...');
        return this.sendMessage(message, true, language);
      }
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
