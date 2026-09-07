import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

let openaiClientInstance: OpenAI | null = null;

export class OpenAIService {
  private static getClient(): OpenAI {
    if (!openaiClientInstance) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not configured in environment.');
      }
      openaiClientInstance = new OpenAI({ apiKey, timeout: 20_000 });
    }
    return openaiClientInstance;
  }

  public static getModel(): string {
    const configured = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    // If set to GPT-5 mini alias or gpt-5-mini, map to gpt-4o-mini unless explicit future model
    if (configured.toLowerCase() === 'gpt-5-mini' || configured.toLowerCase() === 'gpt-5 mini') {
      return 'gpt-4o-mini';
    }
    return configured;
  }

  /**
   * Invokes OpenAI chat completion with function calling
   */
  public static async complete(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[]
  ) {
    const client = this.getClient();
    const model = this.getModel();

    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        tools: tools && tools.length > 0 ? tools : undefined,
        tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
        temperature: 0.2, // Low temperature for factual precision
        max_tokens: 600,
      });

      const choice = response.choices[0];
      return {
        message: choice?.message,
        finishReason: choice?.finish_reason,
        usage: response.usage,
      };
    } catch (err) {
      console.error('[OpenAIService] API error:', (err as Error).message);
      throw err;
    }
  }
}
