import { ConversationService } from '@/conversations/conversation.service';
import { MemoryService } from '@/conversations/memory.service';
import { StateService } from '@/conversations/state.service';
import { ContextBuilder } from '../prompts/context.builder';
import { AGENT_TOOLS } from '../tools/tool.definitions';
import { AIGuard } from '../ai-guard/ai.guard';
import { ToolExecutor } from '../tools/tool.executor';
import { OpenAIService } from '../openai/openai.service';
import { ResponseBuilder } from './response.builder';
import { BotActionResponse } from '@/conversations/conversation.types';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export class AgentOrchestrator {
  /**
   * Main entrypoint for processing any user message through the Agentic AI loop
   */
  public static async processMessage(
    tenantId: string,
    phone: string,
    userText: string,
    customerName?: string,
    extra?: {
      isPhoto?: boolean;
      photoId?: string;
      location?: { latitude: number; longitude: number };
    }
  ): Promise<BotActionResponse> {
    const memory = await ConversationService.getConversation(tenantId, phone, customerName);

    // 1. Check if user is in Human Handoff mode
    if (memory.handoff_status && memory.current_state === 'HUMAN_HANDOFF') {
      const cleanInput = userText.toLowerCase().trim();
      const wantsBotReturn = ['bot', 'asistente', 'menu', 'volver', 'empezar', 'hola'].some(w => cleanInput.includes(w));
      if (!wantsBotReturn) {
        // Do not interfere with human operator
        return {
          text: '🙋 Un asesor de nuestro equipo está atendiendo tu conversación. Si deseas volver al asistente virtual, escribe *volver al bot*.',
        };
      }
      // Re-activate bot
      StateService.transition(memory, 'WELCOME');
    }

    // 2. Handle location payload directly if attached
    if (extra?.location) {
      memory.location = extra.location;
      memory.delivery_mode = 'delivery';
      userText = userText || `Mi ubicación GPS (${extra.location.latitude}, ${extra.location.longitude})`;
    }

    // 3. Append user message to memory
    MemoryService.addMessage(memory, 'user', userText);

    // 4. Build prompt context
    const messages = ContextBuilder.build(memory);
    messages.push({ role: 'user', content: userText });

    try {
      // 5. Call LLM with Tool Calling
      const firstResponse = await OpenAIService.complete(messages, AGENT_TOOLS);
      const assistantMessage = firstResponse.message;

      if (!assistantMessage) {
        throw new Error('No response message received from LLM.');
      }

      // Check for tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Append assistant tool call proposal to conversation messages
        messages.push(assistantMessage as ChatCompletionMessageParam);

        let lastToolResultData: any = null;
        let lastToolName = '';

        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type !== 'function') continue;
          const fnName = toolCall.function.name;
          lastToolName = fnName;
          let fnArgs: Record<string, any> = {};

          try {
            fnArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch {
            fnArgs = {};
          }

          // 6. AI Guard Validation
          const guard = await AIGuard.validateToolCall(tenantId, memory, fnName, fnArgs);

          let toolResult: any;
          if (!guard.passed) {
            console.warn(`[AgentOrchestrator] AI Guard blocked tool ${fnName}: ${guard.reason}`);
            toolResult = { error: guard.reason || 'Acción no permitida por seguridad.' };
          } else {
            // 7. Execute Tool against Backend
            const sanitizedArgs = guard.sanitizedArguments || fnArgs;
            toolResult = await ToolExecutor.execute(tenantId, memory, fnName, sanitizedArgs);
          }

          lastToolResultData = toolResult;

          // Append tool result into context
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }

        // 8. Call LLM again to formulate the final friendly response with backend facts
        const secondResponse = await OpenAIService.complete(messages);
        let finalReply = secondResponse.message?.content || '';

        // If order was confirmed, build receipt
        if (lastToolName === 'create_order' && lastToolResultData?.success && memory.order_code) {
          finalReply = ResponseBuilder.buildOrderConfirmed(memory, memory.order_code);
        }

        // Record assistant response in memory
        MemoryService.addMessage(memory, 'assistant', finalReply);
        await ConversationService.saveConversation(memory);

        return { text: finalReply };
      }

      // 9. Plain conversational response (no tool needed)
      const finalReply = assistantMessage.content || '¡Con gusto! ¿En qué te puedo colaborar?';
      MemoryService.addMessage(memory, 'assistant', finalReply);
      await ConversationService.saveConversation(memory);

      return { text: finalReply };
    } catch (err) {
      console.error('[AgentOrchestrator] Error processing message:', err);
      // Friendly recovery without exposing technical details
      const recoveryMessage = ResponseBuilder.buildErrorMessage();
      return { text: recoveryMessage };
    }
  }
}
