import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

let openaiClientInstance: OpenAI | null = null;
let groqClientInstance: OpenAI | null = null;

export class OpenAIService {
  private static getOpenAIClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    if (!openaiClientInstance) {
      openaiClientInstance = new OpenAI({ apiKey, timeout: 12_000 });
    }
    return openaiClientInstance;
  }

  private static getGroqClient(): OpenAI | null {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;
    if (!groqClientInstance) {
      groqClientInstance = new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
        timeout: 10_000,
      });
    }
    return groqClientInstance;
  }

  public static getModel(): string {
    const configured = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (configured.toLowerCase() === 'gpt-5-mini' || configured.toLowerCase() === 'gpt-5 mini') {
      return 'gpt-4o-mini';
    }
    return configured;
  }

  /**
   * High-Performance AI Execution:
   * 1. Primary: Groq LPU (openai/gpt-oss-120b) -> ultra-fast ~300ms response with tool calling
   * 2. Secondary: OpenAI gpt-4o-mini
   * 3. Tertiary: OpenAI gpt-4o
   */
  public static async complete(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[]
  ) {
    const groq = this.getGroqClient();
    const openai = this.getOpenAIClient();

    // 1. Primary: Groq LPU (Sub-second speed ~300ms)
    if (groq) {
      try {
        const response = await groq.chat.completions.create({
          model: 'openai/gpt-oss-120b',
          messages,
          tools: tools && tools.length > 0 ? tools : undefined,
          tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
          temperature: 0.2,
          max_tokens: 600,
        });

        const choice = response.choices[0];
        if (choice?.message) {
          return {
            message: choice.message,
            finishReason: choice.finish_reason,
            usage: response.usage,
            provider: 'groq-lpu',
          };
        }
      } catch (groqErr: any) {
        console.warn('[OpenAIService] Groq error, falling back to OpenAI:', groqErr?.message || groqErr);
      }
    }

    // 2. Secondary: OpenAI gpt-4o-mini
    if (openai) {
      const primaryModel = this.getModel();
      try {
        const response = await openai.chat.completions.create({
          model: primaryModel,
          messages,
          tools: tools && tools.length > 0 ? tools : undefined,
          tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
          temperature: 0.2,
          max_tokens: 600,
        });

        const choice = response.choices[0];
        if (choice?.message) {
          return {
            message: choice.message,
            finishReason: choice.finish_reason,
            usage: response.usage,
            provider: `openai-${primaryModel}`,
          };
        }
      } catch (err: any) {
        console.warn(`[OpenAIService] ${primaryModel} error:`, err?.message || err);

        // 3. Tertiary: OpenAI flagship gpt-4o
        if (primaryModel !== 'gpt-4o') {
          try {
            console.log('[OpenAIService] Retrying with OpenAI gpt-4o...');
            const response = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages,
              tools: tools && tools.length > 0 ? tools : undefined,
              tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
              temperature: 0.2,
              max_tokens: 600,
            });

            const choice = response.choices[0];
            if (choice?.message) {
              return {
                message: choice.message,
                finishReason: choice.finish_reason,
                usage: response.usage,
                provider: 'openai-gpt-4o',
              };
            }
          } catch (gpt4Err: any) {
            console.error('[OpenAIService] All providers failed:', gpt4Err?.message || gpt4Err);
          }
        }
      }
    }

    throw new Error('No AI provider available (both Groq and OpenAI failed or unconfigured).');
  }
}
