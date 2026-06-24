import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiProvider } from './providers/gemini.provider';
import { ILlmProvider, LlmStreamResult, ConversationTurn, StreamCompletionOptions } from './providers/llm-provider.interface';
import { RetrievedChunk } from './retrieval.service';

// Re-export for consumers still importing from llm.service
export type { LlmStreamResult };

/** Per-provider token cost rates (USD per token). */
const PROVIDER_COSTS: Record<string, { input: number; output: number }> = {
  'gemini-1.5-flash':             { input: 0.000000075, output: 0.0000003 }, // Cost estimated for Gemini 1.5 Flash
};

/** Compute cost in USD given a model name and usage. */
export function computeTokenCost(
  modelName: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rates = PROVIDER_COSTS[modelName] ?? { input: 0.000000075, output: 0.0000003 };
  return promptTokens * rates.input + completionTokens * rates.output;
}

/**
 * LlmService — provider-agnostic orchestrator.
 *
 * Uses GeminiProvider exclusively.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiProvider: GeminiProvider,
  ) {}

  // ---------------------------------------------------------------------------
  // Embedding — Gemini exclusively
  // ---------------------------------------------------------------------------

  async embedQuery(query: string): Promise<number[]> {
    return this.geminiProvider.embedQuery(query);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.geminiProvider.embedBatch(texts);
  }

  // ---------------------------------------------------------------------------
  // Completion — Gemini exclusively
  // ---------------------------------------------------------------------------

  /**
   * Stream a completion using Gemini.
   *
   * @param systemPrompt   The fully assembled system prompt (with context).
   * @param userMessage    The redacted user query.
   * @param history        Prior conversation turns.
   * @param tenantSettings Optional tenant settings (ignored as Gemini is exclusive).
   */
  async streamCompletion(
    systemPrompt: string,
    userMessage: string,
    history: ConversationTurn[] = [],
    tenantSettings?: any,
    options?: StreamCompletionOptions,
  ): Promise<LlmStreamResult> {
    this.logger.log('Streaming completion using GeminiProvider');
    return this.geminiProvider.streamCompletion(systemPrompt, userMessage, history, options);
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
}
