import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface DeliveryZoneValidation {
  valid: boolean;
  city?: string;
  department?: string;
  errorMessage?: string;
  fee: number;
}

export class DeliveryService {
  private static getSupabase(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  /**
   * Fetches tenant settings for delivery configuration
   */
  public static async getTenantDeliverySettings(tenantId: string) {
    const supabase = this.getSupabase();
    const { data } = await supabase
      .from('tenant_settings')
      .select('delivery_fee, coverage_city, coverage_department, coverage_keywords, coverage_require_keywords')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    return {
      delivery_fee: Number(data?.delivery_fee ?? 5000),
      coverage_city: data?.coverage_city || 'Puerto Tejada',
      coverage_department: data?.coverage_department || 'Cauca',
      coverage_keywords: data?.coverage_keywords || ['calle', 'cra', 'carrera', 'diagonal', 'transversal', 'av', 'avenida', 'barrio'],
      coverage_require_keywords: Boolean(data?.coverage_require_keywords ?? false),
    };
  }

  /**
   * Returns authoritative delivery fee for tenant
   */
  public static async getDeliveryFee(tenantId: string, address?: string): Promise<number> {
    const settings = await this.getTenantDeliverySettings(tenantId);
    return settings.delivery_fee;
  }

  /**
   * Validates if address is within delivery coverage
   */
  public static async validateDeliveryZone(tenantId: string, address: string): Promise<DeliveryZoneValidation> {
    const settings = await this.getTenantDeliverySettings(tenantId);
    const cleanAddress = (address || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    if (cleanAddress.length < 5) {
      return {
        valid: false,
        fee: settings.delivery_fee,
        errorMessage: 'Por favor proporciona una dirección completa con calle, carrera o barrio.',
      };
    }

    const cityNorm = (settings.coverage_city || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const hasCity = cleanAddress.includes(cityNorm);
    const hasKeywords = settings.coverage_keywords.some((kw: string) =>
      cleanAddress.includes(kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    );

    // If keywords or city present, or if require_keywords is false and address has adequate length
    if (hasCity || hasKeywords || (!settings.coverage_require_keywords && cleanAddress.length >= 6)) {
      return {
        valid: true,
        city: settings.coverage_city,
        department: settings.coverage_department,
        fee: settings.delivery_fee,
      };
    }

    return {
      valid: false,
      fee: settings.delivery_fee,
      errorMessage: `Solo realizamos entregas en ${settings.coverage_city} (${settings.coverage_department}). Por favor verifica tu dirección.`,
    };
  }
}
