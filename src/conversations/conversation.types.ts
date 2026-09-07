/**
 * Conversation & Memory Types for Shek Food Agentic CRM
 */

export type ConversationState =
  | 'WELCOME'
  | 'MAIN_MENU'
  | 'BROWSING_CATEGORIES'
  | 'BROWSING_PRODUCTS'
  | 'PRODUCT_DETAIL'
  | 'CUSTOMIZING_PRODUCT'
  | 'CART'
  | 'ASKING_ADDRESS'
  | 'CALCULATING_DELIVERY'
  | 'ASKING_PAYMENT'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_VERIFICATION'
  | 'ORDER_REVIEW'
  | 'ORDER_CONFIRMED'
  | 'ORDER_PREPARING'
  | 'ORDER_READY'
  | 'ORDER_DELIVERING'
  | 'ORDER_COMPLETED'
  | 'ORDER_TRACKING'
  | 'HUMAN_HANDOFF';

export type PaymentMethodType = 'cash' | 'transfer' | 'online' | 'ondelivery';

export interface CartAddition {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  additions?: CartAddition[];
}

export interface StructuredMemory {
  conversation_id: string;
  customer_id?: string;
  customer_name?: string;
  phone: string;
  tenant_id: string;
  current_state: ConversationState;
  current_intent?: string;
  last_intent?: string;
  last_product?: string;
  last_variant?: string;
  last_quantity?: number;
  cart_id: string;
  cart: CartItem[];
  address?: string;
  location?: { latitude: number; longitude: number };
  delivery_mode?: 'delivery' | 'pickup';
  delivery_fee: number;
  subtotal: number;
  total: number;
  payment_method?: PaymentMethodType;
  cash_amount?: number;
  change_amount?: number;
  payment_receipt_url?: string;
  order_id?: string;
  order_code?: string;
  last_message_id?: string;
  last_activity: number;
  handoff_status: boolean;
  last_human_interaction?: number;
  reminder_sent?: boolean;
  summary: string;
  history: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: number;
  }>;
}

export interface BotActionResponse {
  text: string;
  buttons?: Array<{ text: string; callback_data: string }>;
  image_url?: string;
  document_url?: string;
  document_filename?: string;
  document_caption?: string;
}
