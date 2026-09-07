import { sendWhatsAppMessage, sendWhatsAppDocument, isBSUID, getCleanRecipient, formatE164, WhatsAppButton } from '@/lib/bot/whatsapp';
import { WhatsAppPolicyService } from '../policy.service';

const YCLOUD_BASE = 'https://api.ycloud.com/v2';

export class YCloudService {
  /**
   * Sends a text message with optional quick-reply buttons
   */
  public static async sendText(options: {
    apiKey: string;
    to: string;
    text: string;
    from?: string;
    buttons?: WhatsAppButton[];
    lastUserActivityTimestamp?: number;
  }): Promise<boolean> {
    const policy = WhatsAppPolicyService.evaluatePolicy(options.lastUserActivityTimestamp);
    if (policy.templateRequired) {
      console.warn(`[YCloudService] WhatsApp 24h window is closed for recipient: ${options.to}. Template required.`);
      // If template is required, we can still attempt sendWhatsAppMessage or invoke template
    }

    return await sendWhatsAppMessage({
      apiKey: options.apiKey,
      to: options.to,
      text: options.text,
      from: options.from,
      buttons: options.buttons,
    });
  }

  /**
   * Sends a document (e.g. PDF Menu)
   */
  public static async sendDocument(options: {
    apiKey: string;
    to: string;
    documentUrl: string;
    filename?: string;
    caption?: string;
    from?: string;
  }): Promise<boolean> {
    return await sendWhatsAppDocument({
      apiKey: options.apiKey,
      to: options.to,
      documentUrl: options.documentUrl,
      filename: options.filename,
      caption: options.caption,
      from: options.from,
    });
  }

  /**
   * Sends a pre-approved WhatsApp Template (for out-of-window messages)
   */
  public static async sendTemplate(options: {
    apiKey: string;
    to: string;
    templateName: string;
    languageCode?: string;
    parameters?: Array<{ type: string; text: string }>;
    from?: string;
  }): Promise<boolean> {
    const isBsuid = isBSUID(options.to);
    const recipientTarget = isBsuid
      ? { recipient: getCleanRecipient(options.to) }
      : { to: formatE164(options.to) || options.to.trim() };

    const body = {
      ...(options.from ? { from: formatE164(options.from) } : {}),
      ...recipientTarget,
      type: 'template',
      template: {
        name: options.templateName,
        language: { code: options.languageCode || 'es' },
        ...(options.parameters ? { components: [{ type: 'body', parameters: options.parameters }] } : {}),
      },
    };

    try {
      const res = await fetch(`${YCLOUD_BASE}/whatsapp/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': options.apiKey },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch (e) {
      console.error('[YCloudService] Error sending template:', e);
      return false;
    }
  }
}
