import { createClient } from '@supabase/supabase-js';

// In-memory LRU set for high-speed deduplication
const processedMessageIds = new Set<string>();
const MAX_CACHE_SIZE = 5000;

export class DeduplicationService {
  /**
   * Checks whether a WhatsApp message_id has already been processed.
   * If not, marks it as processed.
   */
  public static async isDuplicate(messageId: string, tenantId?: string): Promise<boolean> {
    if (!messageId) return false;

    // 1. Fast in-memory check
    if (processedMessageIds.has(messageId)) {
      console.warn(`[DeduplicationService] In-memory duplicate detected: ${messageId}`);
      return true;
    }

    // 2. Add to in-memory cache
    if (processedMessageIds.size > MAX_CACHE_SIZE) {
      const firstEntry = processedMessageIds.values().next().value;
      if (firstEntry) processedMessageIds.delete(firstEntry);
    }
    processedMessageIds.add(messageId);

    // 3. Supabase audit check
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key && tenantId) {
      try {
        const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data } = await supabase
          .from('chat_messages')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('metadata->>message_id', messageId)
          .limit(1)
          .maybeSingle();

        if (data) {
          console.warn(`[DeduplicationService] Database duplicate detected: ${messageId}`);
          return true;
        }

        // Record incoming message_id
        await supabase.from('chat_messages').insert({
          tenant_id: tenantId,
          direction: 'inbound',
          channel: 'whatsapp',
          content: 'INBOUND_MESSAGE_ID',
          metadata: { message_id: messageId, received_at: new Date().toISOString() },
        });
      } catch (e) {
        // Fall back to memory deduplication if DB check fails
      }
    }

    return false;
  }
}
