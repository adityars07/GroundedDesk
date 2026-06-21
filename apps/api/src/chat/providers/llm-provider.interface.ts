/**
 * A normalized token-usage structure returned by all LLM providers.
 */
export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * The streaming result returned by every provider's streamCompletion call.
 * The stream yields raw text deltas; getUsage() resolves once the stream
 * is fully consumed.
 */
export interface LlmStreamResult {
  stream: AsyncIterable<string>;
  getUsage: () => Promise<LlmUsage>;
  /** Which provider actually fulfilled this request (for cost tracking). */
  providerName: string;
  /** Which model was used (for cost tracking). */
  modelName: string;
}

/**
 * A turn in the conversation history passed to the completion call.
 */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Options passed to streamCompletion().
 */
export interface StreamCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  attachments?: Array<{ name: string; url: string; mimeType: string }>;
}

/**
 * Every LLM provider (OpenAI, Anthropic, …) must satisfy this interface.
 * Providers are stateless service classes injected through NestJS DI.
 */
export interface ILlmProvider {
  /** Unique string key, e.g. "openai" or "anthropic". */
  readonly providerName: string;

  /**
   * Generate a dense embedding vector for a query string.
   * Embeddings are always sourced from OpenAI (text-embedding-3-small) for
   * consistency across tenants, so only OpenAIProvider implements this.
   * Anthropic delegates embedding calls to the injected OpenAIProvider.
   */
  embedQuery(text: string): Promise<number[]>;

  /**
   * Stream a chat completion, yielding text deltas.
   */
  streamCompletion(
    systemPrompt: string,
    userMessage: string,
    history?: ConversationTurn[],
    options?: StreamCompletionOptions,
  ): Promise<LlmStreamResult>;
}
