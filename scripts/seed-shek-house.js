#!/usr/bin/env node
/**
 * Seed Script — SHEK HOUSE Menu
 * Inserta categorías y productos del menú basado en las imágenes del restaurante.
 * Tenant ID: ecc2c874-ed2d-4991-864f-215e443db324
 *
 * Uso: node scripts/seed-shek-house.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://rvdujzqsqlcgnoxioihy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2ZHVqenFzcWxjZ25veGlvaWh5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzY5NjM2OSwiZXhwIjoyMTAzMjcyMzY5fQ.s72GiBJoZ4yJvZA2rLdtr0vOVPFUWf39GAu5Ef8i2KQ';

const TENANT_ID = 'ecc2c874-ed2d-4991-864f-215e443db324';

// ──────────────────────────────────────────────────────────────────────────────
// IMÁGENES DE PRODUCTOS (IA generadas + Unsplash temáticas)
// ──────────────────────────────────────────────────────────────────────────────
// Las primeras 6 fueron generadas con IA (subidas a Supabase Storage o URL pública)
// Las restantes usan Unsplash con parámetros temáticos precisos

const IMG = {
  granizado_milo:    'https://images.unsplash.com/photo-1579954115563-e72bf1381629?w=600&q=80',
  granizado_frutas:  'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&q=80',
  granizado_maracuya:'https://images.unsplash.com/photo-1490885578174-acda8905c2c6?w=600&q=80',
  granizado_lulo:    'https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?w=600&q=80',
  granizado_frutos:  'https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?w=600&q=80',
  granizado_limon:   'https://images.unsplash.com/photo-1570831739435-6601aa3fa4fb?w=600&q=80',
  michelada_sencilla:'https://images.unsplash.com/photo-1597290282695-edc43d0e7129?w=600&q=80',
  michelada_fruta:   'https://images.unsplash.com/photo-1582897085656-c636d006a246?w=600&q=80',
  coctel:            'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&q=80',
  cuates:            'https://images.unsplash.com/photo-1564149504298-f7e7a4f5e7d3?w=600&q=80',
  sodas:             'https://images.unsplash.com/photo-1624552184280-9e48e9db7efc?w=600&q=80',
  salchipapa_s:      'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=600&q=80',
  salchipapa_m:      'https://images.unsplash.com/photo-1513639776629-7b61b0ac49cb?w=600&q=80',
  salchipapa_l:      'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=600&q=80',
  salchipapa_xl:     'https://images.unsplash.com/photo-1554520735-0a6b8b6ce8b7?w=600&q=80',
  salchipapa_xxl:    'https://images.unsplash.com/photo-1617093727343-374698b1b08d?w=600&q=80',
};

// ──────────────────────────────────────────────────────────────────────────────
// CATEGORÍAS
// ──────────────────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { name: 'Granizados',              description: 'Bebidas granizadas frías y cremosas — frescas, chimbitas y bien Shek', sort_order: 1 },
  { name: 'Cocteles y Micheladas',   description: 'Cocteles con o sin licor y micheladas artesanales', sort_order: 2 },
  { name: 'Cuates Enchilados',       description: 'Fruta con chamoy, tajín y mucho sabor picante-dulce', sort_order: 3 },
  { name: 'Sodas',                   description: 'Sodas de frutas burbujeantes y bien refrescantes', sort_order: 4 },
  { name: 'Salchipapas — Menú Especial', description: 'Elige, combina y arma tu salchipapa Shek', sort_order: 5 },
];

// ──────────────────────────────────────────────────────────────────────────────
// PRODUCTOS
// ──────────────────────────────────────────────────────────────────────────────
// (category asignado después de insertar categorías)
const PRODUCTS_TEMPLATE = [
  // ── Granizados ──
  {
    name: 'Granizado de Mílo',
    description: 'Cremoso, dulce y bien frío. El favorito de toda la familia.',
    price: 14000,
    category_name: 'Granizados',
    image_url: IMG.granizado_milo,
  },
  {
    name: 'Granizado de Maracuyá',
    description: 'Tropical y refrescante con el intenso sabor del maracuyá fresco.',
    price: 12000,
    category_name: 'Granizados',
    image_url: IMG.granizado_maracuya,
  },
  {
    name: 'Granizado de Lulo',
    description: 'Agridulce y único, el sabor del lulo en cada sorbo.',
    price: 12000,
    category_name: 'Granizados',
    image_url: IMG.granizado_lulo,
  },
  {
    name: 'Granizado de Frutos Rojos',
    description: 'Mezcla de frutos rojos frescos, intenso y colorido.',
    price: 12000,
    category_name: 'Granizados',
    image_url: IMG.granizado_frutos,
  },
  {
    name: 'Granizado de Limón',
    description: 'Refrescante y cítrico, el clásico que nunca falla.',
    price: 12000,
    category_name: 'Granizados',
    image_url: IMG.granizado_limon,
  },
  // ── Cocteles y Micheladas ──
  {
    name: 'Michelada Sencilla',
    description: 'Clásica, fría y con el toque justo de especias y limón.',
    price: 10000,
    category_name: 'Cocteles y Micheladas',
    image_url: IMG.michelada_sencilla,
  },
  {
    name: 'Michelada con Fruta',
    description: 'Con trozos de fruta fresca y el sabor que te gusta.',
    price: 12000,
    category_name: 'Cocteles y Micheladas',
    image_url: IMG.michelada_fruta,
  },
  {
    name: 'Coctel con o sin Licor',
    description: 'Tú eliges el plan, nosotros el sabor. Con o sin alcohol.',
    price: 15000,
    category_name: 'Cocteles y Micheladas',
    image_url: IMG.coctel,
  },
  // ── Cuates Enchilados ──
  {
    name: 'Cuates Enchilados',
    description: 'Fruta, chamoy, tajín y mucho sabor. La combinación perfecta de dulce y picante.',
    price: 15000,
    category_name: 'Cuates Enchilados',
    image_url: IMG.cuates,
  },
  // ── Sodas ──
  {
    name: 'Sodas (Frutos Rojos, Limón o Maracumango)',
    description: 'Burbujeantes, frutales y bien refrescantes. Elige tu sabor favorito.',
    price: 12000,
    category_name: 'Sodas',
    image_url: IMG.sodas,
  },
  // ── Salchipapas ──
  {
    name: 'Shek S',
    description: 'Papa · Salchicha · Queso · Ripio. La entrada perfecta al mundo Shek.',
    price: 14000,
    category_name: 'Salchipapas — Menú Especial',
    image_url: IMG.salchipapa_s,
    is_combo: true,
  },
  {
    name: 'Shek M',
    description: 'Papa · Salchicha · Queso · Maíz · Pollo o Carne desmechada.',
    price: 18000,
    category_name: 'Salchipapas — Menú Especial',
    image_url: IMG.salchipapa_m,
    is_combo: true,
  },
  {
    name: 'Shek L',
    description: 'Papa · Salchicha · Queso · Maíz · Pollo · Carne desmechada · Guacamole.',
    price: 23000,
    category_name: 'Salchipapas — Menú Especial',
    image_url: IMG.salchipapa_l,
    is_combo: true,
  },
  {
    name: 'Shek XL',
    description: 'Papa · Salchicha · Queso · Maíz · Maduro · Pollo · Guacamole · Costilla · Carne desmechada · Chicharrón.',
    price: 32000,
    category_name: 'Salchipapas — Menú Especial',
    image_url: IMG.salchipapa_xl,
    is_combo: true,
  },
  {
    name: 'Shek XXL',
    description: 'TODO incluido: Papa · Salchicha · Queso · Maíz · Maduro · Pollo o Carne · Costilla · Chicharrón · Guacamole.',
    price: 36000,
    category_name: 'Salchipapas — Menú Especial',
    image_url: IMG.salchipapa_xxl,
    is_combo: true,
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 Iniciando seed de SHEK HOUSE...\n');

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1. Insertar categorías — verificar existentes primero, insertar sólo las nuevas
  console.log('📂 Insertando categorías...');

  // Fetch existing categories for this tenant
  const { data: existingCats } = await supabase
    .from('categories')
    .select('id, name')
    .eq('tenant_id', TENANT_ID);

  const existingCatNames = new Set((existingCats || []).map((c) => c.name));

  for (const c of CATEGORIES) {
    if (existingCatNames.has(c.name)) {
      console.log(`  ↩️  Ya existe: ${c.name}`);
      continue;
    }
    const { error: catInsErr } = await supabase.from('categories').insert({
      tenant_id: TENANT_ID,
      name: c.name,
      description: c.description,
      sort_order: c.sort_order,
      is_active: true,
    });
    if (catInsErr) {
      console.error(`  ❌ Error insertando categoría "${c.name}":`, catInsErr.message);
    } else {
      console.log(`  ✅ Categoría creada: ${c.name}`);
    }
  }

  // Fetch all categories for this tenant to build a map
  const { data: allCats, error: fetchCatErr } = await supabase
    .from('categories')
    .select('id, name')
    .eq('tenant_id', TENANT_ID);

  if (fetchCatErr || !allCats) {
    console.error('❌ Error obteniendo categorías:', fetchCatErr?.message);
    process.exit(1);
  }

  const catMap = new Map(allCats.map((c) => [c.name, c.id]));
  console.log(`\n✅ Mapa de categorías: ${[...catMap.keys()].join(' | ')}\n`);

  // 2. Insertar productos
  console.log('🍽️ Insertando productos...');
  let successCount = 0;
  let errorCount = 0;

  for (const p of PRODUCTS_TEMPLATE) {
    const catId = catMap.get(p.category_name);
    if (!catId) {
      console.warn(`  ⚠️  Categoría no encontrada: "${p.category_name}" — saltando ${p.name}`);
      errorCount++;
      continue;
    }

    const payload = {
      tenant_id: TENANT_ID,
      category_id: catId,
      name: p.name,
      description: p.description,
      price: p.price,
      image_url: p.image_url,
      is_available: true,
      is_combo: p.is_combo || false,
    };

    // Check if product already exists
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .eq('name', p.name)
      .single();

    if (existing) {
      // Update existing
      const { error: updErr } = await supabase
        .from('products')
        .update(payload)
        .eq('id', existing.id);
      if (updErr) {
        console.error(`  ❌ Error actualizando "${p.name}":`, updErr.message);
        errorCount++;
      } else {
        console.log(`  ✅ Actualizado: ${p.name} — $${p.price.toLocaleString('es-CO')}`);
        successCount++;
      }
    } else {
      // Insert new
      const { error: insErr } = await supabase
        .from('products')
        .insert(payload);
      if (insErr) {
        console.error(`  ❌ Error insertando "${p.name}":`, insErr.message);
        errorCount++;
      } else {
        console.log(`  ✅ Creado: ${p.name} — $${p.price.toLocaleString('es-CO')}`);
        successCount++;
      }
    }
  }

  console.log(`\n📊 Resumen:`);
  console.log(`  ✅ Productos procesados: ${successCount}`);
  if (errorCount > 0) console.log(`  ❌ Errores: ${errorCount}`);
  console.log(`\n🎉 Menú de SHEK HOUSE cargado exitosamente!\n`);
}

main().catch((e) => {
  console.error('💥 Error fatal:', e.message);
  process.exit(1);
});
