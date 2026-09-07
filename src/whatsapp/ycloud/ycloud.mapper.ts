export interface NormalizedInboundMessage {
  messageId: string;
  from: string;
  to?: string;
  senderName: string;
  type: 'text' | 'image' | 'audio' | 'document' | 'location' | 'interactive' | 'unknown';
  text: string;
  buttonPayload?: string;
  mediaId?: string;
  mediaUrl?: string;
  location?: { latitude: number; longitude: number };
  rawPayload: any;
}

export class YCloudMapper {
  /**
   * Normalizes incoming YCloud webhook payload into uniform structure
   */
  public static mapWebhook(body: any): NormalizedInboundMessage | null {
    if (!body || typeof body !== 'object') return null;

    const message =
      body.whatsappInboundMessage ||
      body.message ||
      body.data?.message ||
      body.whatsappMessage;

    if (!message) return null;

    const messageId = message.id || body.id || `msg_${Date.now()}`;
    const from = message.from || message.whatsapp?.from || message.fromUserId || message.author || '';
    const to = message.to || undefined;
    const senderName = message.customerProfile?.name || message.customerProfile?.username || message.customerName || from;

    const rawType = (message.type || 'text').toLowerCase();
    let type: NormalizedInboundMessage['type'] = 'unknown';
    let text = '';
    let buttonPayload: string | undefined;
    let mediaId: string | undefined;
    let mediaUrl: string | undefined;
    let location: { latitude: number; longitude: number } | undefined;

    if (rawType === 'text') {
      type = 'text';
      text = message.text?.body || '';
    } else if (rawType === 'interactive' || message.interactive || message.button) {
      type = 'interactive';
      const btnReply = message.interactive?.buttonReply || message.interactive?.button_reply || message.button;
      buttonPayload = btnReply?.id || btnReply?.payload || btnReply?.title;
      text = btnReply?.title || buttonPayload || '';
    } else if (rawType === 'location' || message.location) {
      type = 'location';
      const loc = message.location || {};
      const lat = loc.latitude ?? loc.lat;
      const lng = loc.longitude ?? loc.long ?? loc.lng;
      if (lat !== undefined && lng !== undefined) {
        location = { latitude: parseFloat(lat), longitude: parseFloat(lng) };
        text = loc.address || loc.name || `Ubicación GPS (${lat}, ${lng})`;
      }
    } else if (rawType === 'image' || message.image) {
      type = 'image';
      text = message.image?.caption || '';
      mediaId = message.image?.id;
      mediaUrl = message.image?.link || message.image?.url;
    } else if (rawType === 'audio' || message.audio) {
      type = 'audio';
      mediaId = message.audio?.id;
      mediaUrl = message.audio?.link || message.audio?.url;
    } else if (rawType === 'document' || message.document) {
      type = 'document';
      text = message.document?.caption || '';
      mediaId = message.document?.id;
      mediaUrl = message.document?.link || message.document?.url;
    }

    return {
      messageId,
      from,
      to,
      senderName,
      type,
      text,
      buttonPayload,
      mediaId,
      mediaUrl,
      location,
      rawPayload: body,
    };
  }
}
