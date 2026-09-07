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
   * Invokes chat completion with multi-level resilient failover:
   * 1. Primary: OpenAI gpt-4o-mini
   * 2. Secondary: OpenAI gpt-4o
   * 3. High-Performance Failover: Groq LPU (openai/gpt-oss-120b)
   */
  public static async complete(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[]
  ) {
    const openai = this.getOpenAIClient();
    const groq = this.getGroqClient();

    // 1. Primary: OpenAI (configured model, defaults to gpt-4o-mini)
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

        // 1b. Fallback to OpenAI gpt-4o if primary was gpt-4o-mini
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
            console.warn('[OpenAIService] gpt-4o error:', gpt4Err?.message || gpt4Err);
          }
        }
      }
    }

    // 2. High-Performance Failover: Groq LPU (openai/gpt-oss-120b)
    if (groq) {
      try {
        console.log('[OpenAIService] Executing failover via Groq LPU (openai/gpt-oss-120b)...');
        const response = await groq.chat.completions.create({
          model: 'openai/gpt-oss-120b',
          messages,
          tools: tools && tools.length > 0 ? tools : undefined,
          tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
          temperature: 0.2,
          max_tokens: 600,
        });

        const choice = response.choices[0];
        return {
          message: choice?.message,
          finishReason: choice?.finish_reason,
          usage: response.usage,
          provider: 'groq',
        };
      } catch (groqErr: any) {
        console.error('[OpenAIService] Groq failover error:', groqErr?.message || groqErr);
      }
    }

    throw new Error('No AI provider available (both OpenAI and Groq failed or unconfigured).');
  }
}
