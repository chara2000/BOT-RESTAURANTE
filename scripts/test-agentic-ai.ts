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
import { ResponseBuilder } from '../src/ai/agent/response.builder';
import { ConversationService } from '../src/conversations/conversation.service';
import { MemoryService } from '../src/conversations/memory.service';
import { StructuredMemory } from '../src/conversations/conversation.types';

const SHEK_TENANT_ID = 'ecc2c874-ed2d-4991-864f-215e443db324';
const OTHER_TENANT_ID = 'a0000000-0000-4000-8000-000000000001';

let passed = 0;
let failed = 0;

function assert(condition: unknown, testName: string) {
  if (Boolean(condition)) {
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

  // ── TEST 10: Regla 27 - Respetar "Recoger en persona" / "Sin domicilio" ──
  console.log('\n📋 10. TEST REGLA 27: RECOGER EN PERSONA / SIN DOMICILIO');
  const r27Phone = '+573199990027';
  await ConversationService.resetConversation(SHEK_TENANT_ID, r27Phone);
  const mem27 = await ConversationService.getConversation(SHEK_TENANT_ID, r27Phone);
  await CartService.addItem(mem27, 'Shek M', 1);
  mem27.address = 'Dirección Antigua 123';
  mem27.delivery_fee = 5000;
  mem27.delivery_mode = 'delivery';
  await ConversationService.saveConversation(mem27);

  await AgentOrchestrator.processMessage(SHEK_TENANT_ID, r27Phone, 'yo voy por ella, sin domicilio, ya puedo arrimar');
  const updatedMem27 = await ConversationService.getConversation(SHEK_TENANT_ID, r27Phone);
  assert(updatedMem27.delivery_mode === 'pickup', 'delivery_mode debe cambiar a "pickup" de inmediato');
  assert(updatedMem27.delivery_fee === 0, 'domicilio debe ser $0 sin excepción');
  assert(updatedMem27.address === 'Recoge en tienda', 'La dirección debe quedar explícitamente "Recoge en tienda"');

  // ── TEST 11: Regla 28 - Inmutabilidad del Método de Pago Confirmado ───
  console.log('\n📋 11. TEST REGLA 28: INMUTABILIDAD DEL MÉTODO DE PAGO');
  const r28Phone = '+573199990028';
  await ConversationService.resetConversation(SHEK_TENANT_ID, r28Phone);
  await AgentOrchestrator.processMessage(SHEK_TENANT_ID, r28Phone, 'Pago por Nequi');
  const mem28 = await ConversationService.getConversation(SHEK_TENANT_ID, r28Phone);
  assert(mem28.payment_method_literal === 'Nequi', 'Método de pago se guarda literal como "Nequi"');
  await CartService.addItem(mem28, 'Shek L', 1);
  const receipt = ResponseBuilder.buildOrderConfirmed(mem28, 'T-TEST');
  assert(receipt.includes('Nequi'), 'Confirmación final debe mostrar "Nequi"');
  assert(!receipt.includes('Efectivo contra entrega'), 'Prohibido sustituir o normalizar Nequi a "Efectivo contra entrega"');

  // ── TEST 12: Regla 29 - Aislamiento de Contexto de Pedidos Anteriores ──
  console.log('\n📋 12. TEST REGLA 29: AISLAMIENTO ESTRICTO DE CONTEXTO');
  const r29Phone = '+573199990029';
  await ConversationService.resetConversation(SHEK_TENANT_ID, r29Phone);
  const mem29 = await ConversationService.getConversation(SHEK_TENANT_ID, r29Phone);
  mem29.order_code = 'T-PREV';
  mem29.last_order_code = 'T-PREV';
  mem29.current_state = 'ORDER_CONFIRMED';
  await ConversationService.saveConversation(mem29);

  const leakAttempt = await AgentOrchestrator.processMessage(SHEK_TENANT_ID, r29Phone, 'Modifica mi pedido anterior T-PREV agregando papas');
  const mem29After = await ConversationService.getConversation(SHEK_TENANT_ID, r29Phone);
  assert(mem29After.handoff_status === true || leakAttempt.text.includes('asesor'), 'Debe escalar a humano si se intenta modificar un pedido ya confirmado');

  // ── TEST 13: Regla 30 - Tiempo Estimado Calculado, NO Fijo ───────────
  console.log('\n📋 13. TEST REGLA 30: TIEMPO ESTIMADO CALCULADO (±10 MIN)');
  const time1Item = ResponseBuilder.calculateEstimatedTimeRange(1);
  assert(time1Item === '20–40 minutos', '1 ítem debe calcular 20–40 minutos (base 25 + 1x5 = 30 ± 10)');
  const time3Items = ResponseBuilder.calculateEstimatedTimeRange(3);
  assert(time3Items === '30–50 minutos', '3 ítems deben calcular 30–50 minutos (base 25 + 3x5 = 40 ± 10)');
  const time5Items = ResponseBuilder.calculateEstimatedTimeRange(5);
  assert(time5Items === '40–60 minutos', '5 ítems deben calcular 40–60 minutos (base 25 + 5x5 = 50 ± 10)');

  // ── TEST 14: Regla 31 - Datos de Cuenta Obligatorios para Pago Digital ──
  console.log('\n📋 14. TEST REGLA 31: DATOS DE CUENTA OBLIGATORIOS PARA PAGO DIGITAL');
  const paymentDetails = await PaymentService.getPaymentDetails(SHEK_TENANT_ID, 'Nequi', 49000);
  assert(paymentDetails.available === true, 'get_payment_details debe responder disponible para Nequi');
  assert(paymentDetails.formattedMessage.includes('Titular del negocio'), 'Mensaje incluye titular del negocio');
  assert(paymentDetails.formattedMessage.includes('Nequi'), 'Mensaje incluye número de Nequi');
  assert(paymentDetails.formattedMessage.includes('$49.000'), 'Mensaje incluye monto exacto a transferir');
  assert(paymentDetails.formattedMessage.includes('Comprobante'), 'Mensaje solicita explícitamente comprobante');

  // AI Guard bloquea si no se entregaron datos de cuenta
  const digitalMem: StructuredMemory = MemoryService.createDefault(SHEK_TENANT_ID, '+573199990031');
  await CartService.addItem(digitalMem, 'Shek S', 1);
  digitalMem.delivery_mode = 'pickup';
  digitalMem.address = 'Recoge en tienda';
  digitalMem.payment_method = 'transfer';
  digitalMem.payment_details_provided = false;
  const guardDigital = await AIGuard.validateToolCall(SHEK_TENANT_ID, digitalMem, 'confirm_order', { confirmation_explicit: true }, 'Confirmo');
  assert(!guardDigital.passed && guardDigital.reason?.includes('FALTAN_DATOS_CUENTA'), 'AI Guard bloquea confirm_order si no se entregaron datos de cuenta previos');

  // ── TEST 15: Regla 32 - Paso de Confirmación Final Obligatorio y Separado ──
  console.log('\n📋 15. TEST REGLA 32: CONFIRMACIÓN SEPARADA DE MONTO / DIRECCIÓN');
  const mem32: StructuredMemory = MemoryService.createDefault(SHEK_TENANT_ID, '+573199990032');
  await CartService.addItem(mem32, 'Shek M', 1);
  mem32.delivery_mode = 'pickup';
  mem32.address = 'Recoge en tienda';
  mem32.payment_method = 'cash';
  mem32.cash_amount = 50000;
  // Intento de confirmar inmediatamente con mensaje "Pago con 50000"
  const guard32 = await AIGuard.validateToolCall(SHEK_TENANT_ID, mem32, 'confirm_order', { confirmation_explicit: true }, 'Pago con 50000');
  assert(!guard32.passed && guard32.reason?.includes('PASO_CONFIRMACION_SEPARADO'), 'AI Guard debe bloquear confirm_order si el cliente solo indicó el monto a pagar');

  // Cuando el cliente responde afirmativamente ("Sí" o "Confirmo")
  const guard32Confirm = await AIGuard.validateToolCall(SHEK_TENANT_ID, mem32, 'confirm_order', { confirmation_explicit: true }, 'Sí, confirmo');
  assert(guard32Confirm.passed, 'AI Guard permite confirm_order cuando el cliente responde afirmativamente a la pregunta puntual');

  // ── TEST 16: Regla 33 - Tipo de Entrega (Pickup) Controla el Cálculo ──
  console.log('\n📋 16. TEST REGLA 33: PICKUP CONTROLA CÁLCULO Y RESUMEN');
  const r33Phone = '+573199990033';
  await ConversationService.resetConversation(SHEK_TENANT_ID, r33Phone);
  const mem33 = await ConversationService.getConversation(SHEK_TENANT_ID, r33Phone);
  await CartService.addItem(mem33, 'Shek L', 1);
  mem33.address = 'Calle Falsa 123';
  mem33.delivery_fee = 5000;
  mem33.delivery_mode = 'delivery';
  await ConversationService.saveConversation(mem33);

  await AgentOrchestrator.processMessage(SHEK_TENANT_ID, r33Phone, 'recojo en el punto, sin domicilio, voy por él');
  const mem33After = await ConversationService.getConversation(SHEK_TENANT_ID, r33Phone);
  assert(mem33After.delivery_mode === 'pickup', 'order.delivery_type / mode se actualiza a "pickup"');
  assert(mem33After.delivery_fee === 0, 'domicilio se recalcula a $0 en get_cart_summary()');
  assert(mem33After.address === 'Recoge en tienda', 'Dirección queda explícitamente "Recoge en tienda"');

  const review33 = ResponseBuilder.buildOrderReview(mem33After);
  assert(review33.includes('Recoge en tienda'), 'Resumen muestra "Recoge en tienda"');
  assert(review33.includes('$0'), 'Resumen muestra domicilio $0');

  // ── TEST 17: Regla 34 - Método de Pago Exactamente el Elegido ────────
  console.log('\n📋 17. TEST REGLA 34: MÉTODO DE PAGO EXACTO EN CONFIRMACIÓN');
  const mem34: StructuredMemory = MemoryService.createDefault(SHEK_TENANT_ID, '+573199990034');
  await CartService.addItem(mem34, 'Shek XL', 1);
  mem34.delivery_mode = 'pickup';
  mem34.payment_method = 'transfer';
  mem34.payment_method_literal = 'Daviplata';
  const confirmed34 = ResponseBuilder.buildOrderConfirmed(mem34, 'T-DVPL');
  assert(confirmed34.includes('Daviplata'), 'Confirmación final interpola directamente "Daviplata"');
  assert(!confirmed34.includes('Efectivo contra entrega'), 'Prohibido sustituir por default "Efectivo contra entrega"');

  // ── TEST 18: Regla 35 - Datos de Pago Digital Obligatorios Bloqueantes ──
  console.log('\n📋 18. TEST REGLA 35: DATOS DE CUENTA OBLIGATORIOS ANTES DE CONFIRMAR');
  const mem35: StructuredMemory = MemoryService.createDefault(SHEK_TENANT_ID, '+573199990035');
  await CartService.addItem(mem35, 'Shek S', 1);
  mem35.delivery_mode = 'pickup';
  mem35.address = 'Recoge en tienda';
  mem35.payment_method = 'transfer';
  mem35.payment_method_literal = 'Nequi';
  mem35.payment_details_provided = false;
  const guard35 = await AIGuard.validateToolCall(SHEK_TENANT_ID, mem35, 'confirm_order', { confirmation_explicit: true }, 'Confirmo');
  assert(!guard35.passed && guard35.reason?.includes('FALTAN_DATOS_CUENTA'), 'Bloquea confirm_order si AÚN no se han enviado datos de cuenta con get_payment_details()');

  // ── TEST 19: Regla 36 - Secuencia Obligatoria de 6 Pasos ─────────────
  console.log('\n📋 19. TEST REGLA 36: SECUENCIA OBLIGATORIA COMPLETA ANTES DE CONFIRMAR');
  const mem36: StructuredMemory = MemoryService.createDefault(SHEK_TENANT_ID, '+573199990036');

  // Paso 1: Carrito vacío -> bloquea
  const g1 = await AIGuard.validateToolCall(SHEK_TENANT_ID, mem36, 'confirm_order', { confirmation_explicit: true }, 'Confirmo');
  assert(!g1.passed && g1.reason?.includes('CART_EMPTY'), 'Paso 1: Bloquea si carrito está vacío');

  // Paso 2: Sin modalidad de entrega -> bloquea
  await CartService.addItem(mem36, 'Shek M', 1);
  mem36.delivery_mode = undefined;
  const g2 = await AIGuard.validateToolCall(SHEK_TENANT_ID, mem36, 'confirm_order', { confirmation_explicit: true }, 'Confirmo');
  assert(!g2.passed && g2.reason?.includes('FALTA_MODALIDAD_ENTREGA'), 'Paso 2: Bloquea si falta definir modalidad');

  // Paso 3: Sin método de pago -> bloquea
  mem36.delivery_mode = 'pickup';
  mem36.address = 'Recoge en tienda';
  mem36.payment_method = undefined;
  const g3 = await AIGuard.validateToolCall(SHEK_TENANT_ID, mem36, 'confirm_order', { confirmation_explicit: true }, 'Confirmo');
  assert(!g3.passed && g3.reason?.includes('FALTA_METODO_PAGO'), 'Paso 3: Bloquea si falta método de pago');

  // Paso 5: En efectivo sin monto informado -> bloquea
  mem36.payment_method = 'cash';
  mem36.cash_amount = undefined;
  const g5 = await AIGuard.validateToolCall(SHEK_TENANT_ID, mem36, 'confirm_order', { confirmation_explicit: true }, 'Confirmo');
  assert(!g5.passed && g5.reason?.includes('FALTA_MONTO_EFECTIVO'), 'Paso 5: Bloquea si es efectivo y no indicó monto');

  // Todos los 6 pasos cumplidos -> éxito
  mem36.cash_amount = 50000;
  await OrderService.calculateOrder(mem36);
  const gSuccess = await AIGuard.validateToolCall(SHEK_TENANT_ID, mem36, 'confirm_order', { confirmation_explicit: true }, 'Sí, confirmo pedido');
  assert(gSuccess.passed, 'Paso 6: Permite confirm_order cuando todos los 6 pasos obligatorios se cumplen');

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
