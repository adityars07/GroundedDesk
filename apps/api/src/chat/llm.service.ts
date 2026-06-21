import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { ILlmProvider, LlmStreamResult, ConversationTurn, StreamCompletionOptions } from './providers/llm-provider.interface';
import { RetrievedChunk } from './retrieval.service';

// Re-export for consumers still importing from llm.service
export type { LlmStreamResult };

/** Per-provider token cost rates (USD per token). */
const PROVIDER_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o':                       { input: 0.0000025,  output: 0.00001   },
  'gpt-4o-mini':                  { input: 0.00000015, output: 0.0000006 },
  'claude-3-5-sonnet-20241022':   { input: 0.000003,   output: 0.000015  },
  'claude-3-haiku-20240307':      { input: 0.00000025, output: 0.00000125 },
};

/** Compute cost in USD given a model name and usage. */
export function computeTokenCost(
  modelName: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rates = PROVIDER_COSTS[modelName] ?? { input: 0.000003, output: 0.000015 };
  return promptTokens * rates.input + completionTokens * rates.output;
}

/**
 * LlmService — provider-agnostic orchestrator.
 *
 * Reads tenant settings to pick the primary provider (openai | anthropic).
 * On error (rate-limit, 5xx, network), falls back to the fallback provider
 * if configured, then throws.
 *
 * Non-streaming helpers (buildSystemPrompt, extractConfidence, cleanResponse)
 * are provider-independent and live here.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  private readonly providers: Map<string, ILlmProvider>;
  private readonly defaultPrimary: string;
  private readonly defaultFallback: string | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly openaiProvider: OpenAIProvider,
    private readonly anthropicProvider: AnthropicProvider,
  ) {
    this.providers = new Map<string, ILlmProvider>([
      ['openai', this.openaiProvider],
      ['anthropic', this.anthropicProvider],
    ]);

    this.defaultPrimary = this.configService.get<string>('LLM_PRIMARY_PROVIDER', 'openai');
    const fallbackEnv = this.configService.get<string>('LLM_FALLBACK_PROVIDER', '');
    this.defaultFallback = fallbackEnv || null;
  }

  // ---------------------------------------------------------------------------
  // Embedding — always OpenAI for vector-space consistency
  // ---------------------------------------------------------------------------

  async embedQuery(query: string): Promise<number[]> {
    return this.openaiProvider.embedQuery(query);
  }

  // ---------------------------------------------------------------------------
  // Completion — provider-aware with fallback
  // ---------------------------------------------------------------------------

  /**
   * Stream a completion using the tenant's preferred provider.
   * Falls back to the secondary provider if the primary throws.
   *
   * @param systemPrompt   The fully assembled system prompt (with context).
   * @param userMessage    The redacted user query.
   * @param history        Prior conversation turns.
   * @param tenantSettings Optional tenant settings object with llmProvider / fallbackProvider.
   */
  async streamCompletion(
    systemPrompt: string,
    userMessage: string,
    history: ConversationTurn[] = [],
    tenantSettings?: any,
    options?: StreamCompletionOptions,
  ): Promise<LlmStreamResult> {
    const primaryKey: string = tenantSettings?.llmProvider ?? this.defaultPrimary;
    const fallbackKey: string | null = tenantSettings?.fallbackProvider ?? this.defaultFallback;

    const primary = this.resolveProvider(primaryKey);

    try {
      const result = await primary.streamCompletion(systemPrompt, userMessage, history, options);
      this.logger.log(`Using primary provider: ${primaryKey}`);
      return result;
    } catch (primaryErr: any) {
      this.logger.warn(
        `Primary provider "${primaryKey}" failed (${primaryErr?.message}). Trying fallback...`,
      );

      if (!fallbackKey || fallbackKey === primaryKey) {
        throw primaryErr;
      }

      const fallback = this.resolveProvider(fallbackKey);
      this.logger.log(`Falling back to provider: ${fallbackKey}`);
      return fallback.streamCompletion(systemPrompt, userMessage, history, options);
    }
  }

  // ---------------------------------------------------------------------------
  // Prompt building (provider-independent)
  // ---------------------------------------------------------------------------

  buildSystemPrompt(chunks: RetrievedChunk[], tenantSettings?: any): string {
    const welcomeMsg = tenantSettings?.welcomeMessage || 'Hello! How can I help you today?';

    const contextBlock = chunks
      .map((chunk, i) => `[Source ${i + 1}: ${chunk.sourceName}]\n${chunk.content}`)
      .join('\n\n---\n\n');

    return `You are a helpful customer support assistant. Your role is to answer questions based ONLY on the provided knowledge base context.

RULES:
1. Answer questions using ONLY the information in the context below.
2. If the answer is not in the context, say "I don't have enough information to answer that question. Would you like to speak with a human agent?"
3. Always cite your sources using [Source N] notation at the end of relevant sentences.
4. Be concise, professional, and helpful.
5. Never make up information or speculate beyond the context.
6. If asked about topics outside the knowledge base domain, politely redirect.
7. At the end of your response, provide a confidence score from 0 to 1 in the format: [CONFIDENCE: 0.X]

KNOWLEDGE BASE CONTEXT:
${contextBlock || 'No relevant context found.'}

WELCOME MESSAGE (use only for greetings): ${welcomeMsg}`;
  }

  /**
   * Extract confidence score from [CONFIDENCE: X.X] tag.
   */
  extractConfidence(response: string): number {
    const match = response.match(/\[CONFIDENCE:\s*([\d.]+)\]/i);
    if (match) {
      const score = parseFloat(match[1]);
      return Math.min(Math.max(score, 0), 1);
    }
    return 0.5;
  }

  /**
   * Remove the [CONFIDENCE: X.X] tag from the visible response.
   */
  cleanResponse(response: string): string {
    return response.replace(/\[CONFIDENCE:\s*[\d.]+\]/gi, '').trim();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private resolveProvider(key: string): ILlmProvider {
    const provider = this.providers.get(key);
    if (!provider) {
      this.logger.warn(`Unknown LLM provider "${key}", defaulting to openai`);
      return this.openaiProvider;
    }
    return provider;
  }
}
