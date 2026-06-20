import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import type { OrderItem, Product } from '@/types';

// OpenRouter: compatible 100% con la API de OpenAI
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-placeholder',
  defaultHeaders: {
    'HTTP-Referer': 'https://chefflow.app',
    'X-Title': 'ChefFlow Bot',
  },
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface BotSession {
  chatId: number;
  messages: { role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }[];
  cart: OrderItem[];
  orderId?: string;
  customerName?: string;
  paymentMethod?: string;
  paymentStatus?: 'pending' | 'paid';
  changeAmount?: number;
}

// Sessions persisted in-memory (cleared on server restart)
const globalSessions = ((globalThis as Record<string, unknown>).botSessions as Record<number, BotSession>) || {};
(globalThis as Record<string, unknown>).botSessions = globalSessions;

const SYSTEM_PROMPT = `Eres el asistente virtual de "ChefFlow", un restaurante premium. Tu nombre es ChefBot 🤖.
Sé amable, conciso y usa emojis con moderación.

Flujo que DEBES seguir en orden:
1. Saludar cálidamente y ofrecer el menú.
2. Usa 'consultar_menu' para verificar existencia de productos antes de confirmar nada.
3. Usa 'agregar_al_carrito' cuando el cliente quiera un producto.
4. Cuando el cliente quiera terminar, muestra el resumen usando 'ver_carrito'.
5. Pregunta el método de pago: Efectivo 💵 o Electrónico (Nequi/Daviplata/Transferencia) 💳.
6. Si elige EFECTIVO: pregunta "¿Con qué billete vas a pagar? 💵" y cuando responda usa 'procesar_pago_efectivo'.
7. Si elige ELECTRÓNICO: usa 'generar_link_pago' y dile que siga el link.
8. Pide la dirección de entrega o si es para recoger/mesa.
9. Usa 'confirmar_y_enviar_pedido' para finalizar.

REGLAS IMPORTANTES:
- NUNCA inventes precios ni IDs de productos. Siempre usa 'consultar_menu' primero.
- Si el cliente pide algo que no existe, ofrece alternativas similares.
- Si el billete es menor al total, pide uno más grande.
- Sé conversacional, no uses listas de números rígidas.`;

function getSession(chatId: number): BotSession {
  if (!globalSessions[chatId]) {
    globalSessions[chatId] = {
      chatId,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }],
      cart: [],
    };
  }
  return globalSessions[chatId];
}

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'consultar_menu',
      description: 'Busca productos disponibles en el menú por palabra clave o categoría.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Palabra clave (ej. hamburguesa, bebida). Deja vacío para ver todo.' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'agregar_al_carrito',
      description: 'Agrega un producto al carrito usando el ID exacto retornado por consultar_menu.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'ID exacto del producto' },
          quantity: { type: 'number', description: 'Cantidad a agregar (mínimo 1)' },
        },
        required: ['product_id', 'quantity'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'ver_carrito',
      description: 'Devuelve el contenido actual del carrito y el total a pagar.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'procesar_pago_efectivo',
      description: 'Calcula cuánto cambio devolverle al cliente cuando paga en efectivo.',
      parameters: {
        type: 'object',
        properties: {
          monto_billete: { type: 'number', description: 'Valor del billete con el que el cliente va a pagar (ej. 50000)' },
        },
        required: ['monto_billete'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generar_link_pago',
      description: 'Genera un link de pago electrónico y valida automáticamente el pago (modo prueba).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'confirmar_y_enviar_pedido',
      description: 'Finaliza el pedido y lo registra en el sistema. Úsalo solo cuando carrito, pago y dirección estén listos.',
      parameters: {
        type: 'object',
        properties: {
          delivery_address: { type: 'string', description: 'Dirección de entrega. Escribe "Para recoger" o "Mesa X" si aplica.' },
          notes: { type: 'string', description: 'Notas especiales de preparación del pedido.' },
        },
        required: ['delivery_address'],
      },
    },
  },
];

async function runTool(name: string, args: Record<string, unknown>, session: BotSession): Promise<string> {
  const cartTotal = () => session.cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const cartSummary = () =>
    session.cart.map((i, idx) => (idx + 1) + '. ' + i.product.name + ' x' + i.quantity + ' — $' + (i.unit_price * i.quantity).toLocaleString('es-CO')).join('\n');

  switch (name) {
    case 'consultar_menu': {
      const { data, error } = await supabase.from('products').select('id, name, category, price, description').eq('is_available', true);
      if (error) return 'Error al consultar el menú: ' + error.message;
      let items = data as { id: string; name: string; category: string; price: number; description: string }[];
      const query = (args.query as string || '').toLowerCase();
      if (query) items = items.filter(i => i.name.toLowerCase().includes(query) || i.category.toLowerCase().includes(query));
      if (items.length === 0) return 'No se encontraron productos con esa búsqueda.';
      return JSON.stringify(items.map(i => ({ id: i.id, name: i.name, price: i.price, category: i.category, description: i.description })));
    }

    case 'agregar_al_carrito': {
      const { data } = await supabase.from('products').select('*').eq('id', args.product_id as string).single();
      if (!data) return 'Producto no encontrado. Verifica el ID con consultar_menu.';
      const product = data as Product;
      const qty = Math.max(1, Math.min(Number(args.quantity) || 1, 20));
      const existing = session.cart.find(i => i.product.id === product.id);
      if (existing) existing.quantity += qty;
      else session.cart.push({ id: Math.random().toString(36).slice(2), product, quantity: qty, unit_price: product.price });
      return 'Agregado: ' + qty + 'x ' + product.name + ' a $' + product.price.toLocaleString('es-CO') + ' c/u.\nTotal actual del carrito: $' + cartTotal().toLocaleString('es-CO');
    }

    case 'ver_carrito': {
      if (session.cart.length === 0) return 'El carrito está vacío.';
      return 'Carrito actual:\n' + cartSummary() + '\n\nTOTAL: $' + cartTotal().toLocaleString('es-CO');
    }

    case 'procesar_pago_efectivo': {
      const total = cartTotal();
      const billete = Number(args.monto_billete);
      if (isNaN(billete) || billete <= 0) return 'Monto de billete inválido.';
      if (billete < total) return 'El billete de $' + billete.toLocaleString('es-CO') + ' es insuficiente. El total es $' + total.toLocaleString('es-CO') + '. Por favor indica un billete más grande.';
      session.changeAmount = billete - total;
      session.paymentMethod = 'cash';
      session.paymentStatus = 'pending';
      return 'Pago en efectivo registrado. Devuelta a entregar al cliente: $' + session.changeAmount.toLocaleString('es-CO') + '. Informa al cliente este valor.';
    }

    case 'generar_link_pago': {
      const payId = Math.random().toString(36).slice(2, 10).toUpperCase();
      session.paymentMethod = 'transfer';
      session.paymentStatus = 'paid';
      return 'Link de pago generado (llave de prueba activa):\nhttps://pay.breve.link/' + payId + '\n\n✅ El sistema detectó el pago correctamente. El pedido puede ser confirmado.';
    }

    case 'confirmar_y_enviar_pedido': {
      if (session.cart.length === 0) return 'El carrito está vacío. Agrega productos antes de confirmar.';
      const total = cartTotal();
      let notes = (args.notes as string) || '';
      if (session.paymentMethod === 'cash' && session.changeAmount !== undefined) {
        notes += '\n[EFECTIVO] Devuelta requerida: $' + session.changeAmount.toLocaleString('es-CO');
      }
      const address = (args.delivery_address as string) || '';
      const orderId = 'T-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      const orderData = {
        id: orderId,
        type: /mesa|recoger|pickup|llevar/i.test(address) ? 'dine_in' : 'delivery',
        status: 'pending',
        payment_method: session.paymentMethod || 'cash',
        payment_status: session.paymentStatus || 'pending',
        change_amount: session.changeAmount ?? null,
        subtotal: total,
        total,
        delivery_fee: 0,
        tips: 0,
        delivery_address: address,
        notes: notes.trim(),
        created_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('orders').insert([orderData]);
      if (error) return 'Error al guardar el pedido: ' + error.message;
      // Reset cart
      session.cart = [];
      session.changeAmount = undefined;
      session.paymentMethod = undefined;
      session.paymentStatus = undefined;
      return 'Pedido registrado exitosamente en el sistema con ID: ' + orderId + '. Ya está visible en el panel del restaurante.';
    }

    default:
      return 'Función desconocida: ' + name;
  }
}

export async function processMessage(chatId: number, text: string, username: string): Promise<string> {
  const session = getSession(chatId);
  session.customerName = username;
  session.messages.push({ role: 'user', content: text });

  // Agentic loop (max 5 rounds to prevent infinite loops)
  for (let round = 0; round < 5; round++) {
    const response = await openai.chat.completions.create({
      // Free + excellent via OpenRouter
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      messages: session.messages as Parameters<typeof openai.chat.completions.create>[0]['messages'],
      tools: TOOLS,
      tool_choice: 'auto',
    });

    const msg = response.choices[0].message;
    session.messages.push(msg as BotSession['messages'][number]);

    // If no tool calls, the agent has a final response for the user
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return msg.content || 'Lo siento, no pude procesar tu mensaje. Intenta de nuevo.';
    }

    // Execute all tool calls
    for (const call of msg.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }>) {
      const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
      const result = await runTool(call.function.name, args, session);
      session.messages.push({
        role: 'tool',
        content: result,
        tool_call_id: call.id,
      });
    }
  }

  return 'Estoy procesando tu solicitud, por favor un momento... 🔄';
}
