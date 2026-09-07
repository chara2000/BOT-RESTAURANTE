import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const AGENT_TOOLS: ChatCompletionTool[] = [
  // ── Products & Catalog ──
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Busca productos en el catálogo real del restaurante por nombre, categoría o palabra clave.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nombre o término de búsqueda (ej: "salchipapa", "limon", "milo")' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_categories',
      description: 'Obtiene las categorías activas del menú de Shek Food.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_products',
      description: 'Lista los productos de una categoría específica o todo el menú disponible.',
      parameters: {
        type: 'object',
        properties: {
          category_id: { type: 'string', description: 'ID o nombre de la categoría, o "all" para todos' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_menu_pdf',
      description: 'Envía el documento PDF oficial de la carta del restaurante con fotos, descripciones completas y precios.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_variants',
      description: 'Obtiene las variantes de tamaño o precio de un producto (ej: tamaños de Salchipapas Shek S, M, L, XL, XXL).',
      parameters: {
        type: 'object',
        properties: {
          product_name: { type: 'string', description: 'Nombre del producto base (ej: "Salchipapa", "Shek")' },
        },
        required: ['product_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'validate_stock',
      description: 'Valida la disponibilidad de inventario para un producto y cantidad.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'ID del producto a validar' },
          quantity: { type: 'number', description: 'Cantidad solicitada' },
        },
        required: ['product_id', 'quantity'],
      },
    },
  },

  // ── Cart Operations ──
  {
    type: 'function',
    function: {
      name: 'get_cart_summary',
      description: 'Consulta los items actuales en el carrito, subtotal, domicilio y total calculados por el backend (Regla 2 y 7).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cart',
      description: 'Consulta los items actuales en el carrito, subtotal y total calculados por el backend.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_item',
      description: 'Agrega un producto con su tamaño, adiciones y notas al pedido (Regla 10).',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'Nombre o ID del producto (ej: "Shek XL", "Granizado de Lulo", "Salchipapa Shek")' },
          size: { type: 'string', description: 'Tamaño o variante si aplica (ej: "S", "M", "L", "XL", "XXL")' },
          quantity: { type: 'number', description: 'Cantidad de unidades (por defecto 1)' },
          addons: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de adiciones iniciales (ej: ["Guacamole", "Tocineta"])',
          },
          notes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de notas específicas para este producto (ej: ["sin salsa de piña"])',
          },
        },
        required: ['product_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_to_cart',
      description: 'Agrega un producto o variante al carrito de compras con precio validado en base de datos.',
      parameters: {
        type: 'object',
        properties: {
          product_name_or_id: { type: 'string', description: 'Nombre o ID del producto (ej: "Granizado de Limón", "Salchipapa Shek XL")' },
          variant: { type: 'string', description: 'Variante o tamaño si aplica (ej: "XL", "M", "L", "S", "XXL")' },
          quantity: { type: 'number', description: 'Cantidad de unidades (por defecto 1)' },
          notes: { type: 'string', description: 'Instrucciones especiales para este producto (ej: "sin cebolla")' },
          additions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de adiciones solicitadas por el cliente al pedir el producto (ej: ["Guacamole", "Tocineta"])',
          },
        },
        required: ['product_name_or_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_addon',
      description: 'Agrega una adición o topping (guacamole, tocineta, queso costeño, etc.) a un producto que YA existe en el carrito (Regla 4 y 10). NUNCA uses add_item para esto.',
      parameters: {
        type: 'object',
        properties: {
          cart_item_id: { type: 'string', description: 'Nombre o ID del producto en el carrito al que se le agrega la adición (ej: "Shek XL")' },
          addon_id: { type: 'string', description: 'Nombre o ID exacto de la adición (ej: "Guacamole", "Tocineta", "Queso Costeño")' },
        },
        required: ['addon_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_quantity',
      description: 'Actualiza o consolida la cantidad de un producto existente en el carrito (Regla 5 y 10).',
      parameters: {
        type: 'object',
        properties: {
          cart_item_id: { type: 'string', description: 'Nombre o ID del producto en el carrito' },
          qty: { type: 'number', description: 'Nueva cantidad total deseada' },
        },
        required: ['qty'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_cart_item',
      description: 'Actualiza la cantidad o la variante de un producto en el carrito (ej: "agrégame otra", "quita una", "mejor M", "quiero 2").',
      parameters: {
        type: 'object',
        properties: {
          item_query: { type: 'string', description: 'Nombre o ID del item a modificar (o vacío para el último agregado)' },
          quantity: { type: 'number', description: 'Nueva cantidad total deseada' },
          delta: { type: 'number', description: 'Incremento o decremento relativo (+1, -1)' },
          new_variant: { type: 'string', description: 'Nueva variante de tamaño si el cliente cambia de parecer (ej: "M", "L", "XL")' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_item',
      description: 'Elimina un producto del carrito (Regla 10).',
      parameters: {
        type: 'object',
        properties: {
          cart_item_id: { type: 'string', description: 'Nombre o ID del producto a eliminar del carrito' },
        },
        required: ['cart_item_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_cart_item',
      description: 'Elimina completamente un producto del carrito.',
      parameters: {
        type: 'object',
        properties: {
          item_query: { type: 'string', description: 'Nombre o ID del producto a eliminar' },
        },
        required: ['item_query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_cart',
      description: 'Vacía por completo el carrito de compras (Regla 8 y 10).',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── Delivery & Address ──
  {
    type: 'function',
    function: {
      name: 'validate_delivery_zone',
      description: 'Valida si la dirección proporcionada por el cliente está en la zona de cobertura (Puerto Tejada / Cauca).',
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Dirección completa del cliente' },
        },
        required: ['address'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_delivery_fee',
      description: 'Obtiene el costo real y oficial del domicilio configurado en el restaurante.',
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Dirección de entrega' },
        },
      },
    },
  },

  // ── Payment ──
  {
    type: 'function',
    function: {
      name: 'get_payment_methods',
      description: 'Obtiene los métodos de pago habilitados en el restaurante.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payment_instructions',
      description: 'Obtiene las instrucciones y cuentas bancarias seguras para transferencia (Nequi / Bancolombia).',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', description: 'Método elegido ("transfer", "cash", etc.)' },
        },
        required: ['method'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_change',
      description: 'Registra el monto en efectivo con el que pagará el cliente y calcula la devuelta exacta desde backend (Regla 15). NUNCA calcules el vuelto tú mismo.',
      parameters: {
        type: 'object',
        properties: {
          monto_entregado: { type: 'number', description: 'Monto con el que paga el cliente en efectivo (ej: 50000, 100000)' },
          total: { type: 'number', description: 'Total del pedido (opcional)' },
        },
        required: ['monto_entregado'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'provide_cash_amount',
      description: 'Registra el monto en efectivo con el que pagará el cliente y calcula la devuelta exacta.',
      parameters: {
        type: 'object',
        properties: {
          cash_amount: { type: 'number', description: 'Monto con el que paga (ej: 100000, 50000)' },
        },
        required: ['cash_amount'],
      },
    },
  },

  // ── Order Placement & Tracking ──
  {
    type: 'function',
    function: {
      name: 'calculate_order',
      description: 'Calcula determinísticamente subtotal, domicilio y total final del pedido desde backend.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_order',
      description: 'Crea y confirma definitivamente el pedido en la base de datos tras confirmación explícita del cliente y validación de método de pago (Reglas 15 y 16).',
      parameters: {
        type: 'object',
        properties: {
          confirmation_explicit: { type: 'boolean', description: 'Debe ser true solo si el cliente confirmó explícitamente ("sí", "confirmo", "dale")' },
        },
        required: ['confirmation_explicit'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_order',
      description: 'Crea y confirma definitivamente el pedido en la base de datos tras confirmación explícita del cliente.',
      parameters: {
        type: 'object',
        properties: {
          confirmation_explicit: { type: 'boolean', description: 'Debe ser true solo si el cliente confirmó explícitamente ("sí", "confirmo", "dale")' },
        },
        required: ['confirmation_explicit'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order',
      description: 'Consulta el estado actual de preparación o entrega de un pedido mediante su código (ej: "T-XXXX").',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'Código o UUID del pedido' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_order',
      description: 'Cancela un pedido que se encuentra en estado pendiente o confirmado.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'Código o UUID del pedido a cancelar' },
        },
        required: ['order_id'],
      },
    },
  },

  // ── Human Handoff ──
  {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description: 'Transfiere la conversación a un asesor humano cuando una función falla, no se puede resolver la intención tras aclarar, o el cliente solicita asistencia humana (Reglas 10, 11, 14).',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Motivo del escalamiento a humano' },
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'handoff_to_human',
      description: 'Transfiere la conversación a un agente humano del equipo de soporte.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Motivo de la transferencia' },
        },
      },
    },
  },
];
