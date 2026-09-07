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
   * Resilient AI Execution:
   * 1. Primary: OpenAI gpt-4o-mini (Rock-solid, 200k+ TPM, native tool calling, ~1s response)
   * 2. Secondary: OpenAI gpt-4o (Flagship reasoning fallback)
   * 3. Tertiary: Groq LPU (Optional failover)
   */
  public static async complete(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[]
  ) {
    const openai = this.getOpenAIClient();
    const groq = this.getGroqClient();

    // 1. Primary: OpenAI (defaults to gpt-4o-mini, high TPM, zero rate-limit issues)
    if (openai) {
      const primaryModel = this.getModel();
      try {
        const response = await openai.chat.completions.create({
          model: primaryModel,
          messages,
          tools: tools && tools.length > 0 ? tools : undefined,
          tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
          temperature: 0.2,
          max_tokens: 500,
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

        // 2. Secondary: OpenAI flagship gpt-4o
        if (primaryModel !== 'gpt-4o') {
          try {
            console.log('[OpenAIService] Retrying with OpenAI gpt-4o...');
            const response = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages,
              tools: tools && tools.length > 0 ? tools : undefined,
              tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
              temperature: 0.2,
              max_tokens: 500,
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
            console.warn('[OpenAIService] gpt-4o error:', gpt4Err?.message || gpt4Err);
          }
        }
      }
    }

    // 3. Tertiary: Groq LPU failover
    if (groq) {
      try {
        console.log('[OpenAIService] Attempting Groq failover...');
        const response = await groq.chat.completions.create({
          model: 'openai/gpt-oss-120b',
          messages,
          tools: tools && tools.length > 0 ? tools : undefined,
          tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
          temperature: 0.2,
          max_tokens: 500,
        });

        const choice = response.choices[0];
        if (choice?.message) {
          return {
            message: choice.message,
            finishReason: choice.finish_reason,
            usage: response.usage,
            provider: 'groq-failover',
          };
        }
      } catch (groqErr: any) {
        console.warn('[OpenAIService] Groq failover error:', groqErr?.message || groqErr);
      }
    }

    throw new Error('No AI provider available (OpenAI and Groq failed or unconfigured).');
  }
}
