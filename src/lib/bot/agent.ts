import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import type { OrderItem, Product } from '@/types';

// Google Gemini 2.0 Flash — compatible con la API de OpenAI, 1500 req/día gratis sin límite de tokens
const openai = new OpenAI({
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  apiKey: process.env.GEMINI_API_KEY || 'sk-placeholder',
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

const SYSTEM_PROMPT = `Eres ChefBot 🤖, el asistente virtual más amable, intuitivo y conversacional del restaurante premium "ChefFlow". 
¡Tu objetivo es hacer que el cliente sienta que está hablando con un mesero humano real, servicial y carismático!

REGLAS DE PERSONALIDAD Y VISUALES:
- Sé súper conversacional, fluido y natural. No hables como un robot ni uses listas rígidas a menos que estés resumiendo el carrito.
- Organiza la información visualmente: usa saltos de línea, viñetas cortas (•) y emojis para que el texto respire y sea fácil de leer en el celular.
- Resalta en **negrita** los totales, nombres de productos y el ID del pedido.
- Escucha activamente. Si el cliente duda, dale sugerencias deliciosas.

FLUJO INTUITIVO:
1. Saluda con entusiasmo y ofrece ayudarles a elegir del menú (usa 'consultar_menu' en silencio si te piden algo específico).
2. Usa 'agregar_al_carrito' cuando confirmen qué desean. Confirma la acción con un tono alegre ("¡Listo! Acabo de anotar tu deliciosa hamburguesa...").
3. OBLIGATORIO: Cuando sientas que el cliente terminó, muéstrale TODO el resumen de su carrito usando la herramienta 'ver_carrito' ANTES de preguntar cómo pagará.
4. Pregunta cómo desea pagar: Efectivo 💵 o Digital (Nequi/Daviplata/Transfe) 💳.
   - Si Efectivo: Pregunta con qué billete pagan ('procesar_pago_efectivo').
   - Si Digital: Usa 'generar_link_pago'.
5. Pide la dirección de envío o diles si pasarán a recogerlo.
6. Finalmente, usa 'confirmar_y_enviar_pedido'. ¡Despídete deseándoles un día increíble!

RESTRICCIONES TÉCNICAS FATALES:
- NUNCA uses etiquetas XML o <function>. Usa el formato JSON estricto para herramientas.
- NUNCA inventes precios o platos. Usa 'consultar_menu' para verificar.`;

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
      const { data, error } = await supabase.from('products').select('id, name, price, description').eq('is_available', true);
      if (error) return 'Error al consultar el menú: ' + error.message;
      let items = data as { id: string; name: string; price: number; description: string }[];
      const query = (args.query as string || '').toLowerCase();
      if (query) items = items.filter(i => i.name.toLowerCase().includes(query) || (i.description && i.description.toLowerCase().includes(query)));
      if (items.length === 0) return 'No se encontraron productos con esa búsqueda.';
      return JSON.stringify(items.map(i => ({ id: i.id, name: i.name, price: i.price, description: i.description })));
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
        items: session.cart, // AGREGADO: ¡Esto faltaba para que el pedido se registrara con sus productos!
        customer: { name: session.customerName || 'Cliente Telegram' },
        created_at: new Date().toISOString(),
      };
      
      const { error } = await supabase.from('orders').insert([orderData]);
      
      if (error) {
        console.error('Error insertando en Supabase:', error);
        return 'Error al guardar el pedido en la base de datos: ' + error.message;
      }
      
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
  // Si el usuario escribe /start, borramos la sesión para reiniciar el bot (y que tome el nuevo SYSTEM_PROMPT)
  if (text.trim() === '/start') {
    delete globalSessions[chatId];
  }

  const session = getSession(chatId);
  session.customerName = username;
  session.messages.push({ role: 'user', content: text });

  // Agentic loop (max 3 rounds to prevent infinite loops and improve speed)
  for (let round = 0; round < 3; round++) {
    let response;
    try {
      response = await openai.chat.completions.create({
        // Google Gemini 2.0 Flash — rápido, inteligente y 1500 req/día gratis
        model: 'gemini-2.0-flash',
        messages: session.messages as Parameters<typeof openai.chat.completions.create>[0]['messages'],
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 500,
      });
    } catch (apiError: any) {
      if (apiError.status === 400 || apiError.status === 429) {
        // Fallback sin herramientas si Gemini falla temporalmente
        response = await openai.chat.completions.create({
          model: 'gemini-2.0-flash',
          messages: session.messages as Parameters<typeof openai.chat.completions.create>[0]['messages'],
          max_tokens: 300,
        });
      } else {
        throw apiError;
      }
    }

    const msg = response.choices[0].message;

    // Fallback ultra-agresivo para Groq/Llama3
    if (msg.content && msg.content.includes('<function=')) {
      // Extraemos el nombre de la función
      const nameMatch = msg.content.match(/<function=([a-zA-Z0-9_]+)/);
      // Extraemos el primer bloque JSON que encontremos
      const argsMatch = msg.content.match(/(\{[\s\S]*?\})/);
      
      if (nameMatch) {
        const funcName = nameMatch[1];
        const funcArgs = argsMatch ? argsMatch[1] : '{}';

        msg.tool_calls = [{
          id: 'call_' + Math.random().toString(36).substring(7),
          type: 'function',
          function: { name: funcName, arguments: funcArgs }
        }] as any;
        
        // Limpiamos la basura del mensaje
        msg.content = msg.content.replace(/<function=.*?<\/function>/is, '').trim();
        msg.content = msg.content.replace(/<function=[^\>]*\>/is, '').trim();
      }
    }

    session.messages.push(msg as BotSession['messages'][number]);

    // If no tool calls, the agent has a final response for the user
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return msg.content || 'Lo siento, no pude procesar tu mensaje. Intenta de nuevo.';
    }

    // Execute all tool calls
    for (const call of msg.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }>) {
      let args: Record<string, unknown> = {};
      let result = '';
      try {
        args = JSON.parse(call.function.arguments || '{}');
        result = await runTool(call.function.name, args, session);
      } catch (e) {
        result = 'Error interno: Generaste un JSON inválido en tus argumentos. Reintenta llamando a la herramienta con un JSON válido.';
      }

      session.messages.push({
        role: 'tool',
        content: result,
        tool_call_id: call.id,
      });
    }
  }

  return 'Estoy procesando tu solicitud, por favor un momento... 🔄';
}
