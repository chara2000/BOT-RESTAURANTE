export type AgentIntent =
  | 'VIEW_MENU'
  | 'VIEW_CATEGORIES'
  | 'VIEW_PRODUCT'
  | 'SEARCH_PRODUCT'
  | 'ADD_PRODUCT'
  | 'ADD_MULTIPLE_PRODUCTS'
  | 'REMOVE_PRODUCT'
  | 'UPDATE_QUANTITY'
  | 'UPDATE_VARIANT'
  | 'CLEAR_CART'
  | 'VIEW_CART'
  | 'ASK_DELIVERY'
  | 'PROVIDE_ADDRESS'
  | 'CHANGE_ADDRESS'
  | 'ASK_PAYMENT'
  | 'SELECT_PAYMENT'
  | 'CHANGE_PAYMENT'
  | 'PROVIDE_CASH_AMOUNT'
  | 'UPLOAD_RECEIPT'
  | 'CONFIRM_ORDER'
  | 'CANCEL_ORDER'
  | 'TRACK_ORDER'
  | 'RECOMMEND_PRODUCT'
  | 'HELP'
  | 'GO_BACK'
  | 'GO_HOME'
  | 'HUMAN_HANDOFF'
  | 'UNKNOWN';

export interface ExtractedEntities {
  product?: string;
  product_id?: string;
  variant?: string;
  variant_id?: string;
  quantity?: number;
  category?: string;
  address?: string;
  city?: string;
  neighborhood?: string;
  payment_method?: string;
  cash_amount?: number;
  order_id?: string;
  items?: Array<{
    product: string;
    variant?: string;
    quantity?: number;
    notes?: string;
  }>;
}

export interface AgentToolCall {
  name: string;
  arguments: Record<string, any>;
  callId?: string;
}

export interface GuardValidationResult {
  passed: boolean;
  sanitizedArguments?: Record<string, any>;
  reason?: string;
}

export interface AgentExecutionResult {
  intent: AgentIntent;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  toolCallsExecuted: Array<{
    name: string;
    arguments: Record<string, any>;
    result: any;
  }>;
  finalResponseText: string;
  buttons?: Array<{ text: string; callback_data: string }>;
  requiresHumanHandoff?: boolean;
}
