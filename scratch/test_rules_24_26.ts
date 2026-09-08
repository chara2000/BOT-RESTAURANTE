import { AIGuard } from '../src/ai/ai-guard/ai.guard';
import { ResponseBuilder } from '../src/ai/agent/response.builder';
import { OrderService } from '../src/backend/order.service';
import { StructuredMemory } from '../src/conversations/conversation.types';

function createMockMemory(tenantId: string, phone: string): StructuredMemory {
  return {
    conversation_id: 'conv_' + Date.now(),
    cart_id: 'cart_' + Date.now(),
    tenant_id: tenantId,
    phone,
    cart: [],
    subtotal: 0,
    delivery_fee: 5000,
    total: 0,
    current_state: 'WELCOME',
    delivery_mode: 'delivery',
    last_activity: Date.now(),
    handoff_status: false,
    summary: '',
    history: [],
  };
}

async function runTests() {
  console.log('--- TEST SUITE: RULES 24, 25 & 26 ---\n');
  const tenantId = 'ecc2c874-ed2d-4991-864f-215e443db324';

  // ==========================================
  // RULE 24 TESTS: Never invent unmentioned products or quantities
  // ==========================================
  console.log('1. Testing Rule 24: Single ambiguous word rejection...');
  const mem24 = createMockMemory(tenantId, '573000000024');
  
  // Single ambiguous word "aguila"
  const guardSingleWord = await AIGuard.validateToolCall(
    tenantId,
    mem24,
    'add_item',
    { product_id: 'Cerveza Águila', quantity: 1 },
    'aguila'
  );
  if (!guardSingleWord.passed && guardSingleWord.reason?.includes('AMBIGUOUS_PRODUCT_MENTION')) {
    console.log('  [PASS] Single ambiguous word "aguila" blocked with AMBIGUOUS_PRODUCT_MENTION');
  } else {
    console.error('  [FAIL] Single ambiguous word not blocked as expected:', guardSingleWord);
    process.exit(1);
  }

  console.log('2. Testing Rule 24: Product not mentioned rejection...');
  const guardNotMentioned = await AIGuard.validateToolCall(
    tenantId,
    mem24,
    'add_item',
    { product_id: 'Salchipapa Shek XL', quantity: 1 },
    'hola buenas tardes me da una gaseosa'
  );
  if (!guardNotMentioned.passed && guardNotMentioned.reason?.includes('PRODUCT_NOT_MENTIONED')) {
    console.log('  [PASS] Unmentioned product "Salchipapa Shek XL" blocked with PRODUCT_NOT_MENTIONED');
  } else {
    console.error('  [FAIL] Unmentioned product not blocked:', guardNotMentioned);
    process.exit(1);
  }

  console.log('3. Testing Rule 24: Quantity fallback if not stated by customer...');
  const guardQtyFallback = await AIGuard.validateToolCall(
    tenantId,
    mem24,
    'add_item',
    { product_id: 'Shek XL', quantity: 4 },
    'quiero una salchipapa XL sin pina'
  );
  if (guardQtyFallback.passed && guardQtyFallback.sanitizedArguments?.quantity === 1) {
    console.log('  [PASS] Quantity 4 without customer statement fell back to 1');
  } else {
    console.error('  [FAIL] Quantity fallback failed:', guardQtyFallback);
    process.exit(1);
  }

  console.log('4. Testing Rule 24: Explicit customer quantity respected...');
  const guardQtyExplicit = await AIGuard.validateToolCall(
    tenantId,
    mem24,
    'add_item',
    { product_id: 'Shek XL', quantity: 2 },
    'quiero dos salchipapas XL'
  );
  if (guardQtyExplicit.passed && guardQtyExplicit.sanitizedArguments?.quantity === 2) {
    console.log('  [PASS] Explicit quantity "dos" preserved as 2');
  } else {
    console.error('  [FAIL] Explicit quantity not preserved:', guardQtyExplicit);
    process.exit(1);
  }

  // ==========================================
  // RULE 25 TESTS: Digital Payment Method (Nequi/Transfer) vs Cash
  // ==========================================
  console.log('\n5. Testing Rule 25: Digital payment rejects cash change calculation...');
  const mem25 = createMockMemory(tenantId, '573000000025');
  mem25.payment_method = 'transfer';
  mem25.total = 32000;

  const guardDigitalChange = await AIGuard.validateToolCall(
    tenantId,
    mem25,
    'calculate_change',
    { monto_entregado: 50000 },
    'te pago por nequi'
  );
  if (!guardDigitalChange.passed && guardDigitalChange.reason?.includes('DIGITAL_PAYMENT_NO_CHANGE')) {
    console.log('  [PASS] calculate_change blocked for transfer payment');
  } else {
    console.error('  [FAIL] calculate_change was not blocked for transfer:', guardDigitalChange);
    process.exit(1);
  }

  console.log('6. Testing Rule 25: Confirmation receipt displays explicit payment method...');
  mem25.cart = [
    {
      id: 'item-1',
      productId: 'p-1',
      productName: 'Shek XL',
      unitPrice: 32000,
      quantity: 1,
    }
  ];
  mem25.delivery_mode = 'delivery';
  mem25.address = 'Carrera 19 # 10-20 Puerto Tejada';
  mem25.delivery_fee = 5000;
  mem25.total = 37000;

  const receiptTransfer = ResponseBuilder.buildOrderConfirmed(
    mem25,
    'T-TEST25',
    'ord-25',
    mem25.cart,
    37000,
    5000,
    mem25.address
  );
  if (receiptTransfer.includes('Transferencia (Nequi / Bancolombia)') && !receiptTransfer.includes('Devuelta:')) {
    console.log('  [PASS] Transfer receipt shows explicit method and no devuelta');
  } else {
    console.error('  [FAIL] Transfer receipt unexpected format:', receiptTransfer);
    process.exit(1);
  }

  // Check cash receipt
  mem25.payment_method = 'cash';
  mem25.cash_amount = 50000;
  mem25.change_amount = 13000;
  const receiptCash = ResponseBuilder.buildOrderConfirmed(
    mem25,
    'T-CASH25',
    'ord-cash',
    mem25.cart,
    37000,
    5000,
    mem25.address
  );
  if (receiptCash.includes('Efectivo (Pagas con: $50.000 | Devuelta: $13.000)')) {
    console.log('  [PASS] Cash receipt shows explicit cash method with devuelta');
  } else {
    console.error('  [FAIL] Cash receipt unexpected format:', receiptCash);
    process.exit(1);
  }

  // ==========================================
  // RULE 26 TESTS: Validate Line Consistency Before Confirming
  // ==========================================
  console.log('\n7. Testing Rule 26: AIGuard blocks confirmation if duplicate lines exist in cart...');
  const mem26 = createMockMemory(tenantId, '573000000026');
  mem26.payment_method = 'transfer';
  mem26.address = 'Calle 15 # 20-30';
  mem26.delivery_mode = 'delivery';
  mem26.cart = [
    {
      id: 'dup-1',
      productId: 'p-xl',
      productName: 'Shek XL',
      unitPrice: 32000,
      quantity: 1,
    },
    {
      id: 'dup-2',
      productId: 'p-xl',
      productName: 'Shek XL',
      unitPrice: 32000,
      quantity: 1,
    }
  ];
  mem26.total = 69000;

  const guardDupLines = await AIGuard.validateToolCall(
    tenantId,
    mem26,
    'confirm_order',
    { confirmation_explicit: true },
    'confirmo'
  );
  if (!guardDupLines.passed && guardDupLines.reason?.includes('DUPLICATE_LINES_DETECTED')) {
    console.log('  [PASS] AIGuard blocked confirm_order with DUPLICATE_LINES_DETECTED');
  } else {
    console.error('  [FAIL] Duplicate lines were not blocked by AIGuard:', guardDupLines);
    process.exit(1);
  }

  console.log('8. Testing Rule 26: OrderService.createOrder rejects duplicate lines...');
  const createOrderResult = await OrderService.createOrder(mem26);
  if (!createOrderResult.success && createOrderResult.error === 'DUPLICATE_LINES_DETECTED') {
    console.log('  [PASS] OrderService.createOrder rejected duplicate lines with DUPLICATE_LINES_DETECTED');
  } else {
    console.error('  [FAIL] OrderService did not reject duplicate lines:', createOrderResult);
    process.exit(1);
  }

  console.log('9. Testing Rule 26: Friendly error message for DUPLICATE_LINES_DETECTED...');
  const friendlyMsg = ResponseBuilder.formatFriendlyErrorMessage('DUPLICATE_LINES_DETECTED', mem26);
  if (friendlyMsg.includes('asesor humano') && friendlyMsg.includes('líneas repetidas')) {
    console.log('  [PASS] Friendly translation cleanly communicates human escalation without technical jargon');
  } else {
    console.error('  [FAIL] Friendly message format unexpected:', friendlyMsg);
    process.exit(1);
  }

  console.log('\n ALL TESTS FOR RULES 24, 25 & 26 PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
