import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface BusinessHour {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}

const settingsCache = new Map<string, { data: any; at: number }>();
const CACHE_TTL = 60_000; // 1 minute

export class RestaurantService {
  private static getSupabase(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  public static async getSettings(tenantId: string): Promise<any> {
    const cached = settingsCache.get(tenantId);
    if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;

    const supabase = this.getSupabase();
    const { data } = await supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (data) {
      settingsCache.set(tenantId, { data, at: Date.now() });
    }
    return data;
  }

  /**
   * Gets current time in Colombia (UTC-5, no DST)
   */
  public static getColombiaTime(): { dayName: string; minutesOfDay: number } {
    const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000;
    const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    const nowUtc = Date.now();
    const colombiaMs = nowUtc + COLOMBIA_OFFSET_MS;
    const dt = new Date(colombiaMs);

    const dayName = DAYS_ES[dt.getUTCDay()];
    const minutesOfDay = dt.getUTCHours() * 60 + dt.getUTCMinutes();

    return { dayName, minutesOfDay };
  }

  /**
   * Normalizes text for case- and accent-insensitive comparison
   */
  private static normalize(text: string): string {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
      .trim();
  }

  /**
   * Evaluates if restaurant is currently open according to business hours
   */
  public static isRestaurantOpen(hours?: BusinessHour[]): boolean {
    if (!hours || hours.length === 0) return true; // Default open if no config

    const { dayName, minutesOfDay } = this.getColombiaTime();
    const todayHours = hours.find(h => this.normalize(h.day) === this.normalize(dayName));

    if (!todayHours) return true;
    if (todayHours.closed) return false;
    if (!todayHours.open || !todayHours.close) return true;

    const [openH, openM] = todayHours.open.split(':').map(Number);
    const [closeH, closeM] = todayHours.close.split(':').map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    // Supports midnight crossing (e.g. 16:00 to 00:00 or 02:00)
    if (closeMinutes < openMinutes) {
      return minutesOfDay >= openMinutes || minutesOfDay < closeMinutes;
    }

    return minutesOfDay >= openMinutes && minutesOfDay < closeMinutes;
  }

  /**
   * Formats business hours for WhatsApp customer notices
   */
  public static formatBusinessHours(hours?: BusinessHour[]): string {
    if (!hours || hours.length === 0) return '• Lunes a Domingo: 16:00 – 23:00';

    return hours
      .map(h => {
        if (h.closed) {
          return `• *${h.day}:* Cerrado 🌙`;
        }
        return `• *${h.day}:* ${h.open} – ${h.close} 🕒`;
      })
      .join('\n');
  }
}
