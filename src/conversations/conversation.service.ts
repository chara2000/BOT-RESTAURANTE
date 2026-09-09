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

    // 1. If not found in local memory, query Supabase chat_messages targeted by user phone
    if (!memory) {
      const supabase = this.getSupabase();
      if (supabase) {
        try {
          const cleanPhone = phone.replace(/^whatsapp:/i, '').replace(/\D/g, '') || phone.trim();
          const e164 = phone.startsWith('+') ? phone : `+${cleanPhone}`;

          // Primary query: Direct JSONB filter on phone in Postgres
          let { data } = await supabase
            .from('chat_messages')
            .select('metadata')
            .eq('content', 'AGENT_SESSION_STATE')
            .eq('tenant_id', tenantId)
            .filter('metadata->>phone', 'eq', e164)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Secondary attempt with clean digits if e164 had no match
          if (!data?.metadata && cleanPhone !== e164) {
            const { data: altData } = await supabase
              .from('chat_messages')
              .select('metadata')
              .eq('content', 'AGENT_SESSION_STATE')
              .eq('tenant_id', tenantId)
              .filter('metadata->>phone', 'eq', cleanPhone)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (altData?.metadata) data = altData;
          }

          if (data?.metadata) {
            memory = data.metadata as StructuredMemory;
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
      memory.handoff_status = false;
      if (memory.current_state === 'HUMAN_HANDOFF') {
        memory.current_state = 'WELCOME';
      }
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
   * Scans active conversations and sends abandonment reminders for carts left pending (15 - 45 min)
   * Max abandonment window: 45 min (optimal for restaurant operations)
   */
  public static async processAbandonmentReminders(): Promise<{ checked: number; sent: number }> {
    const now = Date.now();
    let checked = 0;
    let sent = 0;

    const { getTenantCreds } = await import('@/lib/bot/whatsapp');
    const { YCloudService } = await import('@/whatsapp/ycloud/ycloud.service');
    const { CartService } = await import('@/backend/cart.service');
    const { ResponseBuilder } = await import('@/ai/agent/response.builder');

    // Collect memories from local store + recent DB sessions
    const candidates: Record<string, StructuredMemory> = { ...globalMemoryStore };

    const supabase = this.getSupabase();
    if (supabase) {
      try {
        const fortyFiveMinAgo = new Date(now - 45 * 60 * 1000).toISOString();
        const { data: recentStates } = await supabase
          .from('chat_messages')
          .select('metadata')
          .eq('content', 'AGENT_SESSION_STATE')
          .gte('created_at', fortyFiveMinAgo)
          .order('created_at', { ascending: false })
          .limit(40);

        if (recentStates) {
          for (const row of recentStates) {
            const mem = row.metadata as StructuredMemory;
            if (mem?.phone && mem.tenant_id) {
              const k = this.getStoreKey(mem.tenant_id, mem.phone);
              if (!candidates[k]) {
                candidates[k] = mem;
              }
            }
          }
        }
      } catch (err) {
        console.warn('[ConversationService] Error fetching DB abandonment candidates:', err);
      }
    }

    for (const [key, memory] of Object.entries(candidates)) {
      checked++;
      if (memory.cart && memory.cart.length > 0 && memory.current_state !== 'ORDER_CONFIRMED' && !memory.reminder_sent) {
        const elapsed = now - (memory.last_activity || now);
        // Window: between 15 min and 45 min
        if (elapsed >= 15 * 60 * 1000 && elapsed <= 45 * 60 * 1000) {
          const creds = await getTenantCreds(memory.tenant_id);
          if (creds?.apiKey) {
            const summary = CartService.formatCartSummary(memory);
            const reminderText = ResponseBuilder.buildAbandonmentReminder(memory.customer_name, summary);
            const ok = await YCloudService.sendText({
              apiKey: creds.apiKey,
              to: memory.phone,
              text: reminderText,
              from: creds.phone || undefined,
              buttons: [
                { text: '🛒 Continuar Pedido', callback_data: 'dame el resumen del pedido' },
                { text: '🗑️ Vaciar Carrito', callback_data: 'vaciar carrito' }
              ],
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
