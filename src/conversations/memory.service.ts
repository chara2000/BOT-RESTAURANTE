import { StructuredMemory, ConversationState, CartItem } from './conversation.types';

export class MemoryService {
  private static readonly MAX_HISTORY_ITEMS = 10;
  private static readonly INACTIVITY_RESET_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Initializes a fresh memory object for a new user/conversation
   */
  public static createDefault(tenantId: string, phone: string, customerName?: string): StructuredMemory {
    return {
      conversation_id: `conv_${tenantId}_${phone.replace(/\D/g, '') || phone}`,
      tenant_id: tenantId,
      phone,
      customer_name: customerName,
      current_state: 'WELCOME',
      cart_id: `cart_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      cart: [],
      delivery_fee: 0,
      subtotal: 0,
      total: 0,
      last_activity: Date.now(),
      handoff_status: false,
      last_human_interaction: undefined,
      reminder_sent: false,
      summary: '',
      history: [],
    };
  }

  /**
   * Cleans and checks inactivity on an existing memory record
   */
  public static checkInactivity(memory: StructuredMemory): StructuredMemory {
    const now = Date.now();
    const elapsed = now - (memory.last_activity || now);

    // If human handoff was active for > 45 min without interaction, release handoff
    if (memory.handoff_status && memory.last_human_interaction) {
      const humanElapsed = now - memory.last_human_interaction;
      if (humanElapsed > 45 * 60 * 1000) {
        memory.handoff_status = false;
        if (memory.current_state === 'HUMAN_HANDOFF') {
          memory.current_state = 'WELCOME';
        }
      }
    }

    // Maximum 1-hour cart abandonment window
    if (elapsed > this.INACTIVITY_RESET_MS && memory.current_state !== 'ORDER_CONFIRMED') {
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
      memory.reminder_sent = false;
      memory.summary = '';
      memory.history = [];
    }

    memory.last_activity = now;
    return memory;
  }

  /**
   * Adds a message to short-term history and manages rolling summary
   */
  public static addMessage(
    memory: StructuredMemory,
    role: 'user' | 'assistant' | 'system' | 'tool',
    content: string
  ): void {
    if (!content || !content.trim()) return;

    memory.history.push({
      role,
      content: content.trim(),
      timestamp: Date.now(),
    });

    // If history exceeds MAX_HISTORY_ITEMS, condense older messages into the rolling summary
    if (memory.history.length > this.MAX_HISTORY_ITEMS) {
      const overflow = memory.history.splice(0, memory.history.length - this.MAX_HISTORY_ITEMS);
      const summarySnippets = overflow
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => `${m.role === 'user' ? 'Cliente' : 'ShekBot'}: ${m.content.slice(0, 80)}`)
        .join(' | ');

      if (memory.summary) {
        memory.summary = `${memory.summary} | ${summarySnippets}`.slice(-400);
      } else {
        memory.summary = summarySnippets.slice(-400);
      }
    }
  }

  /**
   * Calculates subtotal and total based on cart and delivery fee
   */
  public static recalculateCartTotals(memory: StructuredMemory): void {
    if (!memory.cart || memory.cart.length === 0) {
      memory.subtotal = 0;
      memory.total = 0;
      return;
    }

    const subtotal = memory.cart.reduce((sum, item) => {
      const additionsTotal = (item.additions || []).reduce((aSum, a) => aSum + (a.price || 0), 0);
      return sum + (item.unitPrice + additionsTotal) * item.quantity;
    }, 0);

    memory.subtotal = subtotal;
    const fee = memory.delivery_mode === 'pickup' ? 0 : (memory.delivery_fee || 0);
    memory.total = subtotal + fee;

    // Recalculate change if paying with cash
    if (memory.payment_method === 'cash' && memory.cash_amount) {
      if (memory.cash_amount >= memory.total) {
        memory.change_amount = memory.cash_amount - memory.total;
      } else {
        memory.change_amount = undefined;
      }
    }
  }
}
