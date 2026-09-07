import { BotActionResponse } from '@/conversations/conversation.types';
import { ConversationService } from '@/conversations/conversation.service';
import { MemoryService } from '@/conversations/memory.service';
import { StateService } from '@/conversations/state.service';
import { ContextBuilder } from '../prompts/context.builder';
import { OpenAIService } from '../openai/openai.service';
import { AGENT_TOOLS } from '../tools/tool.definitions';
import { AIGuard } from '../ai-guard/ai.guard';
import { ToolExecutor } from '../tools/tool.executor';
import { ResponseBuilder } from './response.builder';
import { RestaurantService } from '@/backend/restaurant.service';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export class AgentOrchestrator {
  /**
   * Main Agentic AI loop following:
   * IA INTERPRETA -> TOOL EJECUTA -> BACKEND VALIDA -> BASE DE DATOS CONFIRMA -> IA RESPONDE
   */
  public static async processMessage(
    tenantId: string,
    phone: string,
    userText: string,
    customerName?: string,
    extra?: {
      location?: { latitude: number; longitude: number };
    }
  ): Promise<BotActionResponse> {
    const memory = await ConversationService.getConversation(tenantId, phone, customerName);

    // Ensure session is clean and active
    memory.handoff_status = false;
    if (memory.current_state === 'HUMAN_HANDOFF') {
      StateService.transition(memory, 'WELCOME');
    }

    // 1. Fetch restaurant settings, business hours and PDF menu
    const settings = await RestaurantService.getSettings(tenantId);
    const isOpen = RestaurantService.isRestaurantOpen(settings?.business_hours);
    const formattedHours = RestaurantService.formatBusinessHours(settings?.business_hours);
    const menuPdfUrl = settings?.menu_pdf_url || (settings?.logo_url?.toLowerCase().includes('.pdf') ? settings.logo_url : null);

    // 2. Handle location payload directly if attached
    if (extra?.location) {
      memory.location = extra.location;
      memory.delivery_mode = 'delivery';
      userText = userText || `Mi ubicación GPS (${extra.location.latitude}, ${extra.location.longitude})`;
    }

    // 3. Check if user specifically requested the PDF menu / carta directly
    const cleanLower = (userText || '').toLowerCase().trim();
    const isDirectPdfRequest = ['carta', 'ver carta', 'pdf', 'ver pdf', 'menu pdf', 'carta pdf', 'la carta', 'mandame la carta', 'enviar carta'].some(
      k => cleanLower === k || cleanLower.includes('carta') || cleanLower.includes('pdf')
    );

    // 4. Append user message to memory
    MemoryService.addMessage(memory, 'user', userText);

    // 5. Build prompt context with schedule and PDF awareness
    const messages = ContextBuilder.build(memory, 'Shek Food', {
      isOpen,
      formattedHours,
      menuPdfUrl,
    });
    messages.push({ role: 'user', content: userText });

    try {
      // 6. Call LLM with Tool Calling (resilient multi-provider)
      const firstResponse = await OpenAIService.complete(messages, AGENT_TOOLS);
      const assistantMessage = firstResponse.message;

      if (!assistantMessage) {
        throw new Error('No response message received from LLM.');
      }

      // 7. Check for tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        messages.push(assistantMessage as ChatCompletionMessageParam);

        let lastToolResultData: any = null;
        let lastToolName = '';
        let documentUrlToSend: string | undefined = undefined;

        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type !== 'function') continue;

          const functionName = toolCall.function.name;
          lastToolName = functionName;

          let rawArguments: any = {};
          try {
            rawArguments = JSON.parse(toolCall.function.arguments || '{}');
          } catch {
            rawArguments = {};
          }

          // Mandatory AI Guard pre-execution gatekeeper
          const guardResult = await AIGuard.validateToolCall(tenantId, memory, functionName, rawArguments);
          if (!guardResult.passed) {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                error: guardResult.reason || 'Operación bloqueada por reglas de negocio.',
                passed: false,
              }),
            });
            continue;
          }

          // Execute tool with backend
          const toolResult = await ToolExecutor.execute(
            tenantId,
            memory,
            functionName,
            guardResult.sanitizedArguments || rawArguments
          );

          lastToolResultData = toolResult.data;

          if (functionName === 'send_menu_pdf' && toolResult.data?.pdf_url) {
            documentUrlToSend = toolResult.data.pdf_url;
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }

        // Call LLM again to formulate the final friendly response with backend facts
        const secondResponse = await OpenAIService.complete(messages);
        let finalReply = secondResponse.message?.content || '';

        // If order was confirmed, build official receipt
        if (lastToolName === 'create_order' && lastToolResultData?.success && memory.order_code) {
          finalReply = ResponseBuilder.buildOrderConfirmed(memory, memory.order_code);
        }

        // Record assistant response in memory
        MemoryService.addMessage(memory, 'assistant', finalReply);
        await ConversationService.saveConversation(memory);

        return {
          text: finalReply,
          document_url: documentUrlToSend || (isDirectPdfRequest ? menuPdfUrl : undefined),
          document_filename: (documentUrlToSend || isDirectPdfRequest) ? 'Carta_Shek_Food.pdf' : undefined,
          document_caption: (documentUrlToSend || isDirectPdfRequest) ? '📄 Carta oficial de Shek Food en PDF 🍟✨' : undefined,
        };
      }

      // 8. Plain conversational response (no tool needed)
      let finalReply = assistantMessage.content || '¡Con mucho gusto! 🍟✨ ¿En qué te puedo colaborar hoy? 😋';

      MemoryService.addMessage(memory, 'assistant', finalReply);
      await ConversationService.saveConversation(memory);

      return {
        text: finalReply,
        document_url: isDirectPdfRequest && menuPdfUrl ? menuPdfUrl : undefined,
        document_filename: isDirectPdfRequest && menuPdfUrl ? 'Carta_Shek_Food.pdf' : undefined,
        document_caption: isDirectPdfRequest && menuPdfUrl ? '📄 Carta oficial de Shek Food en PDF 🍟✨' : undefined,
      };
    } catch (err) {
      console.error('[AgentOrchestrator] Error processing message:', err);
      // Friendly recovery with warm emojis
      const recoveryMessage = ResponseBuilder.buildErrorMessage();
      return { text: recoveryMessage };
    }
  }
}
