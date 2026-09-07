import { ConversationState, StructuredMemory } from './conversation.types';

export class StateService {
  /**
   * Transitions memory to a new state and records previous state
   */
  public static transition(memory: StructuredMemory, newState: ConversationState, reason?: string): ConversationState {
    const previousState = memory.current_state;
    if (previousState === newState) return newState;

    memory.current_state = newState;
    memory.last_activity = Date.now();

    // Reset handoff status if transitioning away from HUMAN_HANDOFF
    if (previousState === 'HUMAN_HANDOFF' && newState !== 'HUMAN_HANDOFF') {
      memory.handoff_status = false;
    } else if (newState === 'HUMAN_HANDOFF') {
      memory.handoff_status = true;
    }

    return newState;
  }

  /**
   * Helper to check if conversation is currently in an active checkout flow
   */
  public static isCheckoutFlow(state: ConversationState): boolean {
    return [
      'CART',
      'ASKING_ADDRESS',
      'CALCULATING_DELIVERY',
      'ASKING_PAYMENT',
      'PAYMENT_PENDING',
      'PAYMENT_VERIFICATION',
      'ORDER_REVIEW',
    ].includes(state);
  }

  /**
   * Helper to check if order has already been created/confirmed
   */
  public static isOrderPlaced(state: ConversationState): boolean {
    return [
      'ORDER_CONFIRMED',
      'ORDER_PREPARING',
      'ORDER_READY',
      'ORDER_DELIVERING',
      'ORDER_COMPLETED',
      'ORDER_TRACKING',
    ].includes(state);
  }
}
