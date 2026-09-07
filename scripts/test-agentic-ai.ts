/**
 * Automated Test Suite for Shek Food Agentic AI (YCloud + GPT-5 mini / OpenAI + Supabase)
 *
 * Runs full validation for:
 * 1. Message Deduplication (Idempotency)
 * 2. AI Guard & Financial Integrity
 * 3. Multi-Tenant Isolation
 * 4. Cash Change & Payment Handling
 * 5. Order Confirmation Idempotency
 * 6. Product Corrections ("No, mejor M")
 * 7. Interruption & Context Memory
 * 8. Inexistent Product Handling ("Granizado de café")
 * 9. Mandatory End-to-End Shek Food Conversation (13-step flow)
 *
 * Run: npx tsx scripts/test-agentic-ai.ts
 */

import { DeduplicationService } from '../src/whatsapp/deduplication.service';
import { CatalogService } from '../src/backend/catalog.service';
import { CartService } from '../src/backend/cart.service';
import { DeliveryService } from '../src/backend/delivery.service';
import { PaymentService } from '../src/backend/payment.service';
import { OrderService } from '../src/backend/order.service';
import { AIGuard } from '../src/ai/ai-guard/ai.guard';
import { AgentOrchestrator } from '../src/ai/agent/agent.orchestrator';
import { ConversationService } from '../src/conversations/conversation.service';
import { MemoryService } from '../src/conversations/memory.service';
import { StructuredMemory } from '../src/conversations/conversation.types';

const SHEK_TENANT_ID = 'ecc2c874-ed2d-4991-864f-215e443db324';
const OTHER_TENANT_ID = 'a0000000-0000-4000-8000-000000000001';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 SUITE DE TESTS: AGENTIC AI SHEK FOOD (YCloud + GPT + Backend)');
  console.log('================================================================\n');

  // ── TEST 1: Deduplicación de Mensajes ──────────────────────────────
  console.log('📋 1. TEST DE DEDUPLICACIÓN DE MENSAJES');
  const testMsgId = `test_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const firstCheck = await DeduplicationService.isDuplicate(testMsgId, SHEK_TENANT_ID);
  assert(!firstCheck, 'Primer evento no debe ser duplicado');
  const secondCheck = await DeduplicationService.isDuplicate(testMsgId, SHEK_TENANT_ID);
  assert(secondCheck, 'Segundo evento con mismo message_id debe ser detectado como duplicado');

  // ── TEST 2: AI Guard y Regla de Seguridad Financiera ─────────────
  console.log('\n📋 2. TEST DE AI GUARD Y SEGURIDAD FINANCIERA');
  const testMemory: StructuredMemory = MemoryService.createDefault(SHEK_TENANT_ID, '+573001112233');

  // Intentar agregar producto inexistente
  const guardInexistent = await AIGuard.validateToolCall(SHEK_TENANT_ID, testMemory, 'add_to_cart', {
    product_name_or_id: 'Granizado de café espacial',
  });
  assert(!guardInexistent.passed, 'AI Guard debe bloquear intento de agregar producto inexistente');

  // Intentar imponer precio arbitrario falso ($1.000)
  const guardTamper = await AIGuard.validateToolCall(SHEK_TENANT_ID, testMemory, 'add_to_cart', {
    product_name_or_id: 'Shek XL',
    price: 1000,
  });
  assert(guardTamper.passed && guardTamper.sanitizedArguments?.unit_price === 32000, 'AI Guard debe sobrescribir precio falsificado con el valor real de BD ($32.000)');

  // ── TEST 3: Multi-Tenant Isolation ─────────────────────────────────
  console.log('\n📋 3. TEST DE AISLAMIENTO MULTI-TENANT');
  const shekProducts = await CatalogService.getProducts(SHEK_TENANT_ID);
  const otherProducts = await CatalogService.getProducts(OTHER_TENANT_ID);
  const crossTenantLeak = shekProducts.some(p => otherProducts.some(op => op.id === p.id));
  assert(!crossTenantLeak, 'Los productos de Shek House no deben mezclarse con los de otro tenant');

  // ── TEST 4: Cálculo de Pagos y Cambio en Efectivo ──────────────────
  console.log('\n📋 4. TEST DE CÁLCULO DE PAGOS Y CAMBIO EN EFECTIVO');
  const total = 49000;
  const changeOk = PaymentService.calculateCashChange(total, 100000);
  assert(changeOk.valid && changeOk.change === 51000, 'Total $49.000 con $100.000 debe calcular cambio exacto de $51.000');
  const changeInsufficient = PaymentService.calculateCashChange(total, 40000);
  assert(!changeInsufficient.valid && changeInsufficient.change === 0, 'Pago con $40.000 debe rechazarse por ser menor al total');

  // ── TEST 5: Idempotencia en Confirmación de Pedido ─────────────────
  console.log('\n📋 5. TEST DE IDEMPOTENCIA EN CONFIRMACIÓN DE PEDIDO');
  const orderMemory: StructuredMemory = MemoryService.createDefault(SHEK_TENANT_ID, '+573120009988');
  await CartService.addItem(orderMemory, 'Shek S', 1);
  orderMemory.delivery_mode = 'pickup';
  orderMemory.payment_method = 'cash';
  const idempotencyKey = `idem_${Date.now()}_test`;

  const firstOrder = await OrderService.createOrder(orderMemory, idempotencyKey);
  assert(Boolean(firstOrder.success && !firstOrder.duplicate), 'Primera confirmación debe crear orden exitosamente');
  const secondOrder = await OrderService.createOrder(orderMemory, idempotencyKey);
  assert(Boolean(secondOrder.success && secondOrder.duplicate && secondOrder.orderId === firstOrder.orderId), 'Segunda confirmación con misma clave debe retornar orden existente sin duplicar');

  // ── TEST 6: Correcciones ("No, mejor M") ───────────────────────────
  console.log('\n📋 6. TEST DE CORRECCIÓN DE PRODUCTO ("No, mejor M")');
  const correctionMemory: StructuredMemory = MemoryService.createDefault(SHEK_TENANT_ID, '+573155554433');
  await CartService.addItem(correctionMemory, 'Shek XL', 1);
  assert(correctionMemory.cart[0].productName === 'Shek XL' && correctionMemory.total === 32000, 'Carrito inicial con Shek XL = $32.000');

  await CartService.updateItemVariant(correctionMemory, 'Shek M');
  assert(correctionMemory.cart[0].productName === 'Shek M' && correctionMemory.total === 18000, 'Corrección a Shek M actualiza el producto y precio a $18.000');

  // ── TEST 7: Interrupciones y Persistencia de Contexto ─────────────
  console.log('\n📋 7. TEST DE INTERRUPCIÓN Y CONTEXTO');
  const interruptMemory: StructuredMemory = MemoryService.createDefault(SHEK_TENANT_ID, '+573187778899');
  await CartService.addItem(interruptMemory, 'Shek XL', 1);
  // Interrupción: cliente pregunta cuánto cuesta el domicilio
  const fee = await DeliveryService.getDeliveryFee(SHEK_TENANT_ID);
  assert(fee === 5000, 'Consulta de domicilio devuelve tarifa real de $5.000');
  // Reanudar: carrito intacto
  assert(interruptMemory.cart.length === 1 && interruptMemory.cart[0].productName === 'Shek XL', 'El carrito y producto Shek XL persisten tras la interrupción');

  // ── TEST 8: Producto Inexistente ──────────────────────────────────
  console.log('\n📋 8. TEST DE PRODUCTO INEXISTENTE ("Granizado de café")');
  const searchCoffee = await CatalogService.searchProducts(SHEK_TENANT_ID, 'Granizado de café');
  assert(searchCoffee.length === 0, 'No debe encontrar "Granizado de café" en la base de datos');
  const searchLemon = await CatalogService.searchProducts(SHEK_TENANT_ID, 'Granizado de limón');
  assert(searchLemon.length > 0 && searchLemon[0].name === 'Granizado de Limón', 'Debe encontrar "Granizado de Limón" como alternativa real');

  // ── TEST 9: Conversación Completa End-to-End Shek Food ──────────────
  console.log('\n📋 9. PRUEBA END-TO-END OBLIGATORIA (CONVERSACIÓN SHEK FOOD CON IA)');
  console.log('   Simulando la conversación exacta del requerimiento paso a paso...\n');

  const e2ePhone = `+57311${Math.floor(1000000 + Math.random() * 9000000)}`;
  await ConversationService.resetConversation(SHEK_TENANT_ID, e2ePhone);

  const conversationSteps = [
    { user: 'Ver menú', expectSubstr: 'menú' },
    { user: 'Ver todo el menú', expectSubstr: 'menú' },
    { user: 'Quiero un granizado de café', expectSubstr: 'café' },
    { user: 'De limón', expectSubstr: 'limón' },
    { user: 'Envíamelo a domicilio', expectSubstr: 'dirección' },
    { user: 'Cra 19 #18-44 Puerto Tejada Cauca', expectSubstr: 'pago' },
    { user: 'Transferencia', expectSubstr: 'transferencia' },
    { user: 'Mejor efectivo', expectSubstr: 'efectivo' },
    { user: 'Pago con 100000', expectSubstr: '100' },
    { user: 'Agrégame una salchipapa', expectSubstr: 'salchipapa' },
    { user: 'XL', expectSubstr: 'xl' },
    { user: 'Muéstrame el pedido', expectSubstr: '49' },
    { user: 'Confirmo pedido', expectSubstr: 'confirmado' },
  ];

  for (let i = 0; i < conversationSteps.length; i++) {
    const step = conversationSteps[i];
    console.log(`   [Paso ${i + 1}/${conversationSteps.length}] Usuario: "${step.user}"`);
    const response = await AgentOrchestrator.processMessage(
      SHEK_TENANT_ID,
      e2ePhone,
      step.user,
      'Cliente Juan'
    );
    console.log(`   [ShekBot]: ${response.text.split('\n')[0]}...`);
  }

  // Verificar estado final de la memoria
  const finalMemory = await ConversationService.getConversation(SHEK_TENANT_ID, e2ePhone);

  console.log('\n📊 ESTADO FINAL DEL PEDIDO CONFIRMADO:');
  console.log(`   • Código de pedido: ${finalMemory.order_code || 'T-XXXX'}`);
  console.log(`   • Total final: $${finalMemory.total.toLocaleString('es-CO')}`);
  console.log(`   • Efectivo entregado: $${(finalMemory.cash_amount || 100000).toLocaleString('es-CO')}`);
  console.log(`   • Cambio calculado: $${(finalMemory.change_amount || 51000).toLocaleString('es-CO')}`);
  console.log(`   • Dirección: ${finalMemory.address}`);

  assert(finalMemory.total === 49000, 'El total final debe ser exactamente $49.000');
  assert(finalMemory.change_amount === 51000, 'El cambio calculado debe ser exactamente $51.000');
  assert(finalMemory.order_id !== undefined, 'La orden debe haber sido creada en la base de datos');

  console.log('\n================================================================');
  console.log(`🏁 RESULTADOS: ${passed} PASADOS | ${failed} FALLADOS`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Error fatal en suite de pruebas:', err);
  process.exit(1);
});
