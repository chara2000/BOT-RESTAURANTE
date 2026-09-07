import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface PaymentInstructions {
  method: string;
  instructions: string;
  nequi?: string;
  bancolombia?: string;
  accountType?: string;
}

export class PaymentService {
  private static getSupabase(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  /**
   * Retrieves allowed payment methods for a tenant
   */
  public static async getPaymentMethods(tenantId: string): Promise<string[]> {
    const supabase = this.getSupabase();
    const { data } = await supabase
      .from('tenant_settings')
      .select('payment_methods')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const methods = data?.payment_methods || ['cash', 'transfer'];
    return methods;
  }

  /**
   * Retrieves secure payment instructions from database
   */
  public static async getPaymentInstructions(tenantId: string, method: string): Promise<PaymentInstructions> {
    const supabase = this.getSupabase();
    const { data } = await supabase
      .from('tenant_settings')
      .select('whatsapp_phone, nequi_number, bancolombia_number, bancolombia_type')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    let nequi = data?.nequi_number || '312 634 1068';
    let bancolombia = data?.bancolombia_number || '123-456789-00';
    let accountType = data?.bancolombia_type || 'Ahorros';

    // Parse legacy whatsapp_phone string if contains nq:...|bc:...
    if (data?.whatsapp_phone && data.whatsapp_phone.includes('|')) {
      const parts = data.whatsapp_phone.split('|');
      const nqMatch = parts[0]?.match(/nq:(.+)/i);
      const bcMatch = parts[1]?.match(/bc:(.+)/i);
      if (nqMatch) nequi = nqMatch[1].trim();
      if (bcMatch) bancolombia = bcMatch[1].trim();
      if (parts[2]) accountType = parts[2].trim();
    }

    if (method.toLowerCase().includes('transfer') || method.toLowerCase().includes('nequi') || method.toLowerCase().includes('banco')) {
      return {
        method: 'transfer',
        instructions: `📲 *Cuentas para Transferencia:*\n\n🟣 *Nequi / Daviplata:* ${nequi}\n🟡 *Bancolombia (${accountType}):* ${bancolombia}\n\n_Por favor envía una foto o captura del comprobante por aquí una vez realizada la transferencia._`,
        nequi,
        bancolombia,
        accountType,
      };
    }

    return {
      method: 'cash',
      instructions: '💵 *Pago en Efectivo contra entrega.* Por favor indícanos con cuánto vas a pagar para llevarte el cambio exacto.',
    };
  }

  /**
   * Deterministic cash change calculation
   */
  public static calculateCashChange(
    total: number,
    cashAmount: number
  ): { valid: boolean; change: number; message: string } {
    if (cashAmount < total) {
      const missing = total - cashAmount;
      return {
        valid: false,
        change: 0,
        message: `⚠️ El monto ($${cashAmount.toLocaleString('es-CO')}) es menor al total del pedido ($${total.toLocaleString('es-CO')}). Faltan $${missing.toLocaleString('es-CO')}.`,
      };
    }

    const change = cashAmount - total;
    return {
      valid: true,
      change,
      message: `💰 Total: $${total.toLocaleString('es-CO')} | 💵 Pagas con: $${cashAmount.toLocaleString('es-CO')} | 🔄 Cambio: $${change.toLocaleString('es-CO')}`,
    };
  }
}
