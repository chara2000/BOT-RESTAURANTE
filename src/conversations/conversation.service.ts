import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StructuredMemory } from './conversation.types';
import { MemoryService } from './memory.service';

const globalMemoryStore = ((globalThis as any).__agentStructuredMemories as Record<string, StructuredMemory>) || {};
(globalThis as any).__agentStructuredMemories = globalMemoryStore;

export class ConversationService {
  private static getSupabase(): SupabaseClient | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private static getStoreKey(tenantId: string, phone: string): string {
    const cleanPhone = phone.replace(/^whatsapp:/i, '').replace(/\D/g, '') || phone.trim();
    return `${tenantId}:${cleanPhone}`;
  }

  /**
   * Retrieves active conversation memory from memory cache or Supabase
   */
  public static async getConversation(tenantId: string, phone: string, customerName?: string): Promise<StructuredMemory> {
    const key = this.getStoreKey(tenantId, phone);
    let memory: StructuredMemory | null = globalMemoryStore[key] || null;

    // 1. If not found in local memory, query Supabase chat_messages
    if (!memory) {
      const supabase = this.getSupabase();
      if (supabase) {
        try {
          const { data } = await supabase
            .from('chat_messages')
            .select('metadata')
            .eq('content', 'AGENT_SESSION_STATE')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(15);

          if (data && data.length > 0) {
            const cleanPhone = phone.replace(/^whatsapp:/i, '').replace(/\D/g, '') || phone.trim();
            const match = data.find((row: any) => {
              const rowPhone = (row.metadata?.phone || '').replace(/\D/g, '');
              return rowPhone === cleanPhone || row.metadata?.phone === phone;
            });
            if (match?.metadata) {
              memory = match.metadata as StructuredMemory;
            }
          }
        } catch (err) {
          console.warn('[ConversationService] Error loading session from Supabase:', (err as Error).message);
        }
      }
    }

    // 2. If still no memory, initialize default
    if (!memory) {
      memory = MemoryService.createDefault(tenantId, phone, customerName);
    } else {
      memory = MemoryService.checkInactivity(memory);
      if (customerName && !memory.customer_name) {
        memory.customer_name = customerName;
      }
    }

    globalMemoryStore[key] = memory;
    return memory;
  }

  /**
   * Saves updated memory to memory cache and asynchronously persists to Supabase
   */
  public static async saveConversation(memory: StructuredMemory): Promise<void> {
    const key = this.getStoreKey(memory.tenant_id, memory.phone);
    memory.last_activity = Date.now();
    globalMemoryStore[key] = memory;

    const supabase = this.getSupabase();
    if (!supabase) return;

    try {
      await supabase.from('chat_messages').insert([{
        tenant_id: memory.tenant_id,
        direction: 'outbound',
        content: 'AGENT_SESSION_STATE',
        metadata: memory as any,
      }]);
    } catch (err) {
      console.warn('[ConversationService] Failed to persist session to Supabase:', (err as Error).message);
    }
  }

  /**
   * Clears cart and resets conversation to welcome state
   */
  public static async resetConversation(tenantId: string, phone: string): Promise<StructuredMemory> {
    const memory = await this.getConversation(tenantId, phone);
    memory.current_state = 'WELCOME';
    memory.cart = [];
    memory.subtotal = 0;
    memory.total = 0;
    memory.delivery_fee = 0;
    memory.address = undefined;
    memory.payment_method = undefined;
    memory.cash_amount = undefined;
    memory.change_amount = undefined;
    memory.order_id = undefined;
    memory.order_code = undefined;
    memory.summary = '';
    memory.history = [];
    await this.saveConversation(memory);
    return memory;
  }

  /**
   * Scans active conversations and sends abandonment reminders for carts left pending (30 - 55 min)
   * Max abandonment window: 1 hour
   */
  public static async processAbandonmentReminders(): Promise<{ checked: number; sent: number }> {
    const now = Date.now();
    let checked = 0;
    let sent = 0;

    const { getTenantCreds } = await import('@/lib/bot/whatsapp');
    const { YCloudService } = await import('@/whatsapp/ycloud/ycloud.service');
    const { CartService } = await import('@/backend/cart.service');
    const { ResponseBuilder } = await import('@/ai/agent/response.builder');

    for (const [key, memory] of Object.entries(globalMemoryStore)) {
      checked++;
      if (memory.cart && memory.cart.length > 0 && memory.current_state !== 'ORDER_CONFIRMED' && !memory.reminder_sent) {
        const elapsed = now - (memory.last_activity || now);
        // Window: between 30 min and 58 min
        if (elapsed >= 30 * 60 * 1000 && elapsed <= 58 * 60 * 1000) {
          const creds = await getTenantCreds(memory.tenant_id);
          if (creds?.apiKey) {
            const summary = CartService.formatCartSummary(memory);
            const reminderText = ResponseBuilder.buildAbandonmentReminder(memory.customer_name, summary);
            const ok = await YCloudService.sendText({
              apiKey: creds.apiKey,
              to: memory.phone,
              text: reminderText,
              from: creds.phone || undefined,
            });
            if (ok) {
              sent++;
              memory.reminder_sent = true;
              await this.saveConversation(memory);
            }
          }
        }
      }
    }

    return { checked, sent };
  }
}
