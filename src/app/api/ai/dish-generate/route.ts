import { NextRequest, NextResponse } from 'next/server';

interface ColombianDishRef {
  keywords: string[];
  category: string;
  defaultPrice: number;
  imageUrl: string;
  descriptionTemplate: string;
}

const COLOMBIAN_DISH_DATABASE: ColombianDishRef[] = [
  {
    keywords: ['salchipapa', 'salchimonstruo', 'salchipapas', 'papas con salchicha', 'salchi'],
    category: 'Salchipapas',
    defaultPrice: 28000,
    imageUrl: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
    descriptionTemplate: 'Papas a la francesa y papa criolla doradas, salchicha premium seleccionada, tocineta crujiente, queso costeño y doble crema gratinado, ripio de papa y variedad de salsas de la casa (tártara, piña y rosada).',
  },
  {
    keywords: ['hamburguesa', 'burger', 'shek', 'artesanal', 'doble carne', 'smash'],
    category: 'Hamburguesas',
    defaultPrice: 26000,
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
    descriptionTemplate: 'Deliciosa hamburguesa artesanal con 180g de carne madurada a la parrilla, queso cheddar y costeño fundido, tocineta ahumada caramelizada, lechuga fresca, tomate, ripio de papa en suave pan brioche sellado con mantequilla.',
  },
  {
    keywords: ['picada', 'chicharron', 'morcilla', 'chorizo', 'fritanga', 'costilla'],
    category: 'Picadas & Parrilla',
    defaultPrice: 48000,
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76538d7e027?w=600&auto=format&fit=crop&q=80',
    descriptionTemplate: 'Auténtica picada colombiana con trozos de chicharrón carnudo y crocante, costilla de cerdo ahumada, chorizo santarrosano, morcilla, papa criolla dorada, plátano maduro con queso y ají casero.',
  },
  {
    keywords: ['mazorcada', 'desgranado', 'choclo', 'maiz', 'desgranados', 'mazorcas'],
    category: 'Desgranados',
    defaultPrice: 25000,
    imageUrl: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=600&auto=format&fit=crop&q=80',
    descriptionTemplate: 'Tierna mazorca dulce desgranada a la mantequilla, acompañada de jugoso pollo y carne desmechada, tocineta picada, abundate queso costeño rallado, ripio de papa crocante y salsa tártara artesanal.',
  },
  {
    keywords: ['perro', 'hot dog', 'hotdog', 'perro caliente'],
    category: 'Comidas Rápidas',
    defaultPrice: 18000,
    imageUrl: 'https://images.unsplash.com/photo-1619740455993-9e612b1af08a?w=600&auto=format&fit=crop&q=80',
    descriptionTemplate: 'Perro caliente especial con salchicha jumbo seleccionada, tocineta, queso mozzarella fundido, cebolla picada con salsa de piña casera, ripio de papa crocante, huevo de codorniz y salsas especiales.',
  },
  {
    keywords: ['granizado', 'frappe', 'milo', 'frutas', 'smoothie', 'fresa', 'maracuya'],
    category: 'Bebidas & Granizados',
    defaultPrice: 12000,
    imageUrl: 'https://images.unsplash.com/photo-1556881286-fc6915169721?w=600&auto=format&fit=crop&q=80',
    descriptionTemplate: 'Refrescante y cremoso granizado servido a punto de nieve con abundante leche condensada, salsa artesanal de frutas y lluvia de topping crujiente al estilo Shek House.',
  },
  {
    keywords: ['michelada', 'cerveza', 'corona', 'club colombia', 'fruta', 'mango biche', 'maracuyá'],
    category: 'Bebidas & Cócteles',
    defaultPrice: 14000,
    imageUrl: 'https://images.unsplash.com/photo-1536935338788-846bb9981813?w=600&auto=format&fit=crop&q=80',
    descriptionTemplate: 'Michelada tradicional o frutal escarchada con sal, limón fresco recién exprimido, pulpa natural de mango biche / maracuyá y chamoy artesanal con cerveza fría.',
  },
  {
    keywords: ['patacon', 'patacones', 'hogao', 'ahogado', 'platano'],
    category: 'Entradas',
    defaultPrice: 16000,
    imageUrl: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&auto=format&fit=crop&q=80',
    descriptionTemplate: 'Crujientes patacones de plátano verde recién fritos, servidos con generoso hogao criollo tradicional colombiano, carne desmechada y queso costeño rallado.',
  },
  {
    keywords: ['alitas', 'wings', 'bbq', 'bufalo', 'alitas bbq'],
    category: 'Alitas & Pollo',
    defaultPrice: 24000,
    imageUrl: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=600&auto=format&fit=crop&q=80',
    descriptionTemplate: 'Jugosas alitas de pollo crocantes por fuera y suaves por dentro, bañadas en tu salsa favorita (BBQ dulce, Maracuyá picante o Miel Mostaza), acompañadas de papas y bastones de apio.',
  },
  {
    keywords: ['pizza', 'pizzas', 'mozzarella'],
    category: 'Pizzas',
    defaultPrice: 38000,
    imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
    descriptionTemplate: 'Masa artesanal horneada a la piedra, salsa de tomate natural, abundante queso mozzarella fundido y los mejores ingredientes frescos seleccionados.',
  },
];

export async function POST(req: NextRequest) {
  try {
    const { name, category: inputCategory } = await req.json();

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Nombre del platillo requerido' }, { status: 400 });
    }

    const cleanName = name.toLowerCase().trim();

    // 1. Check if we have an AI key for Gemini enhancement
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    let generatedDescription = '';
    let matchedImage = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600';
    let suggestedCategory = inputCategory || 'Especialidades';
    let suggestedPrice = 25000;

    // Find best match in Colombian library
    const matchedRef = COLOMBIAN_DISH_DATABASE.find((dish) =>
      dish.keywords.some((kw) => cleanName.includes(kw))
    );

    if (matchedRef) {
      matchedImage = matchedRef.imageUrl;
      suggestedCategory = matchedRef.category;
      suggestedPrice = matchedRef.defaultPrice;
      generatedDescription = matchedRef.descriptionTemplate;
    }

    // 2. If Gemini API is configured, generate ultra-personalized Colombian gastro copy
    if (apiKey) {
      try {
        const prompt = `Actúa como chef ejecutivo y redactor gastronómico colombiano para el restaurante "Shek House".
Crea una descripción apetitosa, profesional y corta (máximo 25 palabras) para el siguiente platillo colombiano: "${name}".
Incluye detalles sensoriales (crujiente, jugoso, ahumado, gratinado, salsas colombianas de la casa).
Responde únicamente con un JSON con la siguiente estructura:
{
  "description": "descripción apetitosa aquí",
  "category": "categoría del plato",
  "suggested_price": 25000
}`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 250 },
            }),
          }
        );

        if (res.ok) {
          const geminiData = await res.json();
          const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.description) generatedDescription = parsed.description;
            if (parsed.category && !inputCategory) suggestedCategory = parsed.category;
            if (parsed.suggested_price) suggestedPrice = Number(parsed.suggested_price);
          }
        }
      } catch (err) {
        console.warn('[api/ai/dish-generate] Gemini fallback:', err);
      }
    }

    if (!generatedDescription) {
      generatedDescription = `Exquisito ${name} preparado al instante con ingredientes frescos de primera calidad y el sazón inconfundible de la casa.`;
    }

    return NextResponse.json({
      name,
      description: generatedDescription,
      image_url: matchedImage,
      category: suggestedCategory,
      suggested_price: suggestedPrice,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error generando platillo con IA';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
