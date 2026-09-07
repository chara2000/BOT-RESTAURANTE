import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

let openaiClientInstance: OpenAI | null = null;
let groqClientInstance: OpenAI | null = null;

// Track OpenAI rate-limit cooldown to avoid consecutive slow 429 retries
let openAiCooldownUntil = 0;

export class OpenAIService {
  private static getOpenAIClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    if (!openaiClientInstance) {
      openaiClientInstance = new OpenAI({ apiKey, timeout: 4_000 });
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
        timeout: 15_000,
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
   * Invokes chat completion with automatic resilient multi-provider failover.
   * Primary: OpenAI (gpt-4o-mini)
   * High-Performance Failover: Groq (openai/gpt-oss-120b)
   */
  public static async complete(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[]
  ) {
    const now = Date.now();
    const isCooldownActive = now < openAiCooldownUntil;
    const openai = this.getOpenAIClient();
    const groq = this.getGroqClient();

    // 1. Try OpenAI if not in active 429 cooldown
    if (openai && !isCooldownActive) {
      try {
        const model = this.getModel();
        const response = await openai.chat.completions.create({
          model,
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
          provider: 'openai',
        };
      } catch (err: any) {
        const isRateLimit = err?.status === 429 || err?.code === 'rate_limit_exceeded' || String(err?.message || '').includes('429');
        if (isRateLimit) {
          // Put OpenAI in 10-minute cooldown
          openAiCooldownUntil = Date.now() + 10 * 60 * 1000;
          console.warn('[OpenAIService] OpenAI 429 rate limit detected. Activating Groq failover for 10 minutes...');
        } else {
          console.warn('[OpenAIService] OpenAI error:', err?.message || err, '. Attempting Groq fallback...');
        }
      }
    }

    // 2. Resilient failover: Groq LPU engine (openai/gpt-oss-120b)
    if (groq) {
      try {
        console.log('[OpenAIService] Executing via Groq LPU (openai/gpt-oss-120b)...');
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
        throw groqErr;
      }
    }

    throw new Error('No AI provider available (both OpenAI and Groq failed or unconfigured).');
  }
}
