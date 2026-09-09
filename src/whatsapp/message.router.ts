import { NormalizedInboundMessage } from './ycloud/ycloud.mapper';
import { DeduplicationService } from './deduplication.service';
import { AgentOrchestrator } from '@/ai/agent/agent.orchestrator';
import { YCloudService } from './ycloud/ycloud.service';
import { getTenantCreds } from '@/lib/bot/whatsapp';

export class MessageRouter {
  /**
   * Main router directing normalized incoming events to the appropriate agent workflow
   */
  public static async route(tenantId: string, inbound: NormalizedInboundMessage): Promise<boolean> {
    if (!inbound.from) return false;

    // 1. Deduplication Gate
    const isDup = await DeduplicationService.isDuplicate(inbound.messageId, tenantId);
    if (isDup) {
      console.log(`[MessageRouter] Ignoring duplicated event: ${inbound.messageId}`);
      return true; // Return 200 OK so YCloud stops retrying
    }

    const creds = await getTenantCreds(tenantId);
    if (!creds?.apiKey) {
      console.warn(`[MessageRouter] No YCloud API credentials found for tenant: ${tenantId}`);
      return false;
    }

    // Ignore if sender is the bot itself (prevent self-loop)
    if (creds.phone) {
      const cleanFrom = inbound.from.replace(/\D/g, '');
      const cleanBotPhone = creds.phone.replace(/\D/g, '');
      if (cleanBotPhone && (cleanFrom.endsWith(cleanBotPhone) || cleanBotPhone.endsWith(cleanFrom))) {
        console.log(`[MessageRouter] Ignoring self-outbound message from bot number: ${inbound.from}`);
        return true;
      }
    }

    let processedText = inbound.text || '';
    const extra: {
      isPhoto?: boolean;
      photoId?: string;
      location?: { latitude: number; longitude: number };
    } = {};

    // 2. Type-Specific Pre-processing
    switch (inbound.type) {
      case 'interactive':
        processedText = inbound.buttonPayload || inbound.text || '';
        break;

      case 'location':
        if (inbound.location) {
          extra.location = inbound.location;
          processedText = inbound.text || `Ubicación GPS (${inbound.location.latitude}, ${inbound.location.longitude})`;
        }
        break;

      case 'image':
        extra.isPhoto = true;
        extra.photoId = inbound.mediaUrl || inbound.mediaId;
        processedText = inbound.text || 'Comprobante de pago adjunto';
        break;

      case 'audio': {
        const audioUrl = inbound.mediaUrl || (inbound.mediaId ? `https://api.ycloud.com/v2/whatsapp/media/${inbound.mediaId}` : null);
        if (audioUrl) {
          try {
            console.log('[MessageRouter] Downloading audio note from YCloud for Whisper transcription...');
            const audioRes = await fetch(audioUrl, {
              headers: creds.apiKey ? { 'X-API-Key': creds.apiKey } : undefined,
            });
            if (audioRes.ok) {
              const arrayBuf = await audioRes.arrayBuffer();
              const { OpenAIService } = await import('@/ai/openai/openai.service');
              const transcribed = await OpenAIService.transcribeAudio(Buffer.from(arrayBuf));
              if (transcribed) {
                console.log(`[MessageRouter] Audio transcribed successfully: "${transcribed}"`);
                processedText = transcribed;
              } else {
                processedText = inbound.text || 'Mensaje de voz recibido';
              }
            } else {
              processedText = inbound.text || 'Mensaje de voz recibido';
            }
          } catch (audioErr) {
            console.warn('[MessageRouter] Audio download/transcribe error:', audioErr);
            processedText = inbound.text || 'Mensaje de voz recibido';
          }
        } else {
          processedText = inbound.text || 'Mensaje de voz recibido';
        }
        break;
      }

      case 'text':
      default:
        processedText = inbound.text || '';
        break;
    }

    if (!processedText.trim() && !extra.location && !extra.isPhoto) {
      return true;
    }

    // 3. Delegate to Agent Orchestrator
    const agentResponse = await AgentOrchestrator.processMessage(
      tenantId,
      inbound.from,
      processedText,
      inbound.senderName,
      extra
    );

    // 4. Send Document (e.g. PDF Menu) if requested
    if (agentResponse.document_url) {
      await YCloudService.sendDocument({
        apiKey: creds.apiKey,
        to: inbound.from,
        documentUrl: agentResponse.document_url,
        filename: agentResponse.document_filename || 'Carta_Menu.pdf',
        caption: agentResponse.document_caption || '📖 Carta y Menú del Restaurante',
        from: creds.phone || undefined,
      });
      await new Promise(r => setTimeout(r, 400));
    }

    // 5. Send WhatsApp Message
    if (agentResponse.text) {
      await YCloudService.sendText({
        apiKey: creds.apiKey,
        to: inbound.from,
        text: agentResponse.text,
        from: creds.phone || undefined,
        buttons: agentResponse.buttons,
      });
    }

    return true;
  }
}
