import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Product, Category, AdditionItem } from '@/types';

export interface CatalogVariant {
  id: string;
  name: string;
  price: number;
  product_id: string;
}

export class CatalogService {
  private static getSupabase(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  /**
   * Normalizes text for case- and accent-insensitive matching
   */
  public static normalize(text: string): string {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * Lists all active categories for a tenant
   */
  public static async getCategories(tenantId: string): Promise<Category[]> {
    const supabase = this.getSupabase();
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, description, sort_order, is_active')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error || !data) {
      console.warn('[CatalogService] getCategories error:', error?.message);
      return [];
    }
    return data as Category[];
  }

  /**
   * Gets the official PDF menu URL if configured in tenant_settings
   */
  public static async getMenuPdf(tenantId: string): Promise<string | null> {
    const supabase = this.getSupabase();
    const { data } = await supabase
      .from('tenant_settings')
      .select('menu_pdf_url, logo_url')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!data) return null;
    if (data.menu_pdf_url) return data.menu_pdf_url;
    if (data.logo_url && data.logo_url.toLowerCase().includes('.pdf')) return data.logo_url;
    return null;
  }

  /**
   * Gets available products for a tenant, optionally filtered by category
   */
  public static async getProducts(tenantId: string, categoryId?: string): Promise<Product[]> {
    const supabase = this.getSupabase();
    let query = supabase
      .from('products')
      .select('id, name, price, description, image_url, is_available, category_id, is_combo')
      .eq('tenant_id', tenantId)
      .eq('is_available', true)
      .order('created_at', { ascending: true });

    if (categoryId && categoryId !== 'all') {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;
    if (error || !data) {
      console.warn('[CatalogService] getProducts error:', error?.message);
      return [];
    }
    return data as Product[];
  }

  /**
   * Gets a single product by exact or prefix ID
   */
  public static async getProduct(tenantId: string, productId: string): Promise<Product | null> {
    const supabase = this.getSupabase();
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', productId)
      .maybeSingle();

    if (error || !data) {
      // Try like search if shortened ID
      const { data: alt } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .like('id', `${productId}%`)
        .limit(1)
        .maybeSingle();
      return (alt as Product) || null;
    }

    return data as Product;
  }

  /**
   * Searches products by natural text query (fuzzy keyword matching)
   */
  public static async searchProducts(tenantId: string, query: string): Promise<Product[]> {
    const products = await this.getProducts(tenantId);
    const cleanQuery = this.normalize(query);

    if (!cleanQuery) return products;

    // Score-based matching
    const scored = products.map(p => {
      const pName = this.normalize(p.name);
      const pDesc = this.normalize(p.description || '');
      let score = 0;

      // Exact match
      if (pName === cleanQuery) score += 1000;
      else if (pName.startsWith(cleanQuery)) score += 500;
      else if (pName.includes(cleanQuery)) score += 200;

      // Size variant detection for Shek Salchipapas
      const hasShekWord = cleanQuery.includes('salchipapa') || cleanQuery.includes('shek') || cleanQuery.includes('papa');
      const isSizeM = /\b(m|mediana|mediano)\b/.test(cleanQuery);
      const isSizeS = /\b(s|pequeña|pequena|pequeno)\b/.test(cleanQuery);
      const isSizeL = /\b(l|grande)\b/.test(cleanQuery) && !cleanQuery.includes('xl');
      const isSizeXL = /\b(xl)\b/.test(cleanQuery) && !cleanQuery.includes('xxl');
      const isSizeXXL = /\b(xxl)\b/.test(cleanQuery);

      if (hasShekWord || isSizeM || isSizeS || isSizeL || isSizeXL || isSizeXXL) {
        if (isSizeXL && pName === 'shek xl') score += 800;
        if (isSizeXXL && pName === 'shek xxl') score += 800;
        if (isSizeL && pName === 'shek l') score += 800;
        if (isSizeM && pName === 'shek m') score += 800;
        if (isSizeS && pName === 'shek s') score += 800;
      }

      // Flavour detection for granizados
      if (cleanQuery.includes('limon') && pName.includes('limon')) score += 600;
      if (cleanQuery.includes('milo') && pName.includes('milo')) score += 600;
      if (cleanQuery.includes('lulo') && pName.includes('lulo')) score += 600;
      if (cleanQuery.includes('maracuya') && pName.includes('maracuya')) score += 600;
      if (cleanQuery.includes('frutos rojos') && pName.includes('frutos rojos')) score += 600;

      // Token matching
      const tokens = cleanQuery.split(/\s+/).filter(Boolean);
      const matchedTokens = tokens.filter(tok => pName.includes(tok) || pDesc.includes(tok));
      if (tokens.length > 0 && matchedTokens.length === tokens.length) {
        score += 100 * tokens.length;
      }

      return { product: p, score };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.product);
  }

  /**
   * Returns known variants for customizable products (e.g. Salchipapas Shek S, M, L, XL, XXL)
   */
  public static async getProductVariants(tenantId: string, productIdOrName: string): Promise<CatalogVariant[]> {
    const products = await this.getProducts(tenantId);
    const clean = this.normalize(productIdOrName);

    // If searching variants for Salchipapa / Shek
    if (clean.includes('salchipapa') || clean.includes('shek') || clean.includes('papa')) {
      const shekProducts = products.filter(p => this.normalize(p.name).startsWith('shek '));
      return shekProducts.map(p => ({
        id: p.id,
        name: p.name.replace(/^shek\s+/i, '').toUpperCase(),
        price: p.price,
        product_id: p.id,
      }));
    }

    return [];
  }

  /**
   * Validates stock availability for an item
   */
  public static async validateStock(tenantId: string, productId: string, quantity: number): Promise<{ available: boolean; currentStock?: number }> {
    const product = await this.getProduct(tenantId, productId);
    if (!product) return { available: false };

    // If stock column exists and is tracked, check quantity
    if (product.stock !== undefined && product.stock !== null) {
      return {
        available: product.stock >= quantity,
        currentStock: product.stock,
      };
    }

    // Default to available if product is active
    return { available: product.is_available, currentStock: 999 };
  }
}
