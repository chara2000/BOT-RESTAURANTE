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
      .select('id, name, price, description, image_url, is_available, category_id, is_combo, additions')
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
   * Normalizes "salchipapa shek", "salchipapa", "shek" across all size variants (S, M, L, XL, XXL)
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

      // Salchipapa and Shek size variant normalization
      const isSalchipapaQuery = cleanQuery.includes('salchipapa') || cleanQuery.includes('shek') || cleanQuery.includes('papa');
      const isSizeXXL = /\b(xxl|doble extra grande|doble extra|gigante)\b/i.test(cleanQuery);
      const isSizeXL = /\b(xl|extra grande)\b/i.test(cleanQuery) && !isSizeXXL;
      const isSizeL = /\b(l|grande)\b/i.test(cleanQuery) && !isSizeXL && !isSizeXXL;
      const isSizeM = /\b(m|mediana|mediano)\b/i.test(cleanQuery);
      const isSizeS = /\b(s|pequena|pequeno|personal|chica)\b/i.test(cleanQuery);

      const isSalchipapaProduct = pName.includes('shek') || pName.includes('salchipapa');

      if (isSalchipapaProduct && (isSalchipapaQuery || isSizeXXL || isSizeXL || isSizeL || isSizeM || isSizeS)) {
        if (isSizeXXL && (pName === 'shek xxl' || pName.includes('xxl'))) score += 1500;
        else if (isSizeXL && (pName === 'shek xl' || (pName.includes('xl') && !pName.includes('xxl')))) score += 1500;
        else if (isSizeL && (pName === 'shek l' || (pName.includes(' l') && !pName.includes('xl')))) score += 1500;
        else if (isSizeM && (pName === 'shek m' || pName.includes(' m') || pName.includes('mediana'))) score += 1500;
        else if (isSizeS && (pName === 'shek s' || pName.includes(' s') || pName.includes('personal'))) score += 1500;
      }

      // Flavour detection for granizados
      if (cleanQuery.includes('lulo') && pName.includes('lulo')) score += 1200;
      else if (cleanQuery.includes('limon') && pName.includes('limon')) score += 1200;
      else if (cleanQuery.includes('maracuya') && pName.includes('maracuya')) score += 1200;
      else if (cleanQuery.includes('frutos rojos') && pName.includes('frutos rojos')) score += 1200;
      else if (cleanQuery.includes('milo') && pName.includes('milo')) score += 1200;

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

  /**
   * Matches requested addition names against product additions or known common additions (guacamole, tocineta, queso)
   */
  public static resolveAdditions(
    product: Product,
    requestedAdditions: string[]
  ): Array<{ id: string; name: string; price: number }> {
    if (!requestedAdditions || requestedAdditions.length === 0) return [];

    const result: Array<{ id: string; name: string; price: number }> = [];
    const productAdditions = (product.additions || []).filter(a => a.is_available !== false);

    // Known fallback prices for common additions in fast-food if not explicitly in product additions
    const commonFallbacks: Record<string, { name: string; price: number }> = {
      guacamole: { name: 'Adición de Guacamole', price: 4000 },
      queso: { name: 'Adición de Queso Costeño', price: 5000 },
      tocineta: { name: 'Adición de Tocineta', price: 5000 },
      papas: { name: 'Adición de Papas', price: 6000 },
      salchicha: { name: 'Adición de Salchicha', price: 4000 },
      carne: { name: 'Adición de Carne', price: 6000 },
      pollo: { name: 'Adición de Pollo', price: 6000 },
      huevo: { name: 'Adición de Huevo de Codorniz', price: 3000 },
    };

    for (const req of requestedAdditions) {
      const cleanReq = this.normalize(req);
      if (!cleanReq) continue;

      // 1. Try to find in product.additions
      const matched = productAdditions.find(a => {
        const aNorm = this.normalize(a.name);
        return aNorm.includes(cleanReq) || cleanReq.includes(aNorm);
      });

      if (matched) {
        result.push({
          id: matched.id || `add_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: matched.name,
          price: Number(matched.price),
        });
        continue;
      }

      // 2. Check common fallbacks
      const fallbackKey = Object.keys(commonFallbacks).find(k => cleanReq.includes(k));
      if (fallbackKey) {
        const fb = commonFallbacks[fallbackKey];
        result.push({
          id: `add_fb_${fallbackKey}`,
          name: fb.name,
          price: fb.price,
        });
      } else {
        // Generic addition with 0 or minimal price if user just wrote a note
        result.push({
          id: `add_custom_${Date.now()}`,
          name: req.trim(),
          price: 0,
        });
      }
    }

    return result;
  }

  /**
   * Validates if a preparation note or modifier makes sense for a given product.
   * Prevents food notes ('sin salsa de piña', 'sin cebolla') from sticking to drinks ('granizado de lulo').
   */
  public static isNoteApplicableToProduct(productName: string, note?: string): boolean {
    if (!note || !note.trim()) return true;
    const p = this.normalize(productName);
    const n = this.normalize(note);

    const isDrink = p.includes('granizado') || p.includes('bebida') || p.includes('jugo') || p.includes('gaseosa') || p.includes('agua') || p.includes('milo');
    const isFoodOnlyNote = /\b(salsa|pina|cebolla|tartara|ripio|queso|tocineta|salchicha|carne|pollo|papas|huevo|mostaza|mayonesa|rosada|verde|ripio|lechuga|tomate)\b/i.test(n);

    if (isDrink && isFoodOnlyNote) {
      return false; // Drinks do not carry food sauces or fast-food toppings
    }

    const isFood = p.includes('shek') || p.includes('salchipapa') || p.includes('hamburguesa') || p.includes('perro');
    const isDrinkOnlyNote = /\b(hielo|azucar|pitillo|vaso)\b/i.test(n);
    if (isFood && isDrinkOnlyNote) {
      return false;
    }

    return true;
  }
}
