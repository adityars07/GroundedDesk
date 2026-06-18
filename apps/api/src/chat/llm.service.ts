import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { RetrievedChunk } from './retrieval.service';

export interface LlmStreamResult {
  stream: AsyncIterable<string>;
  getUsage: () => Promise<{ promptTokens: number; completionTokens: number; totalTokens: number }>;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private openai: OpenAI;
  private chatModel: string;
  private embeddingModel: string;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
    this.chatModel = this.configService.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o');
    this.embeddingModel = this.configService.get<string>(
      'OPENAI_EMBEDDING_MODEL',
      'text-embedding-3-small',
    );
  }

  /**
   * Generate an embedding for a query string.
   */
  async embedQuery(query: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: query,
    });
    return response.data[0].embedding;
  }

  /**
   * Build the system prompt with grounded context from retrieved chunks.
   */
  buildSystemPrompt(chunks: RetrievedChunk[], tenantSettings?: any): string {
    const welcomeMsg = tenantSettings?.welcomeMessage || 'Hello! How can I help you today?';

    const contextBlock = chunks
      .map(
        (chunk, i) =>
          `[Source ${i + 1}: ${chunk.sourceName}]\n${chunk.content}`,
      )
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
   * Stream a chat completion response.
   * Returns an async iterator of text chunks plus a way to get final usage.
   */
  async streamCompletion(
    systemPrompt: string,
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  ): Promise<LlmStreamResult> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const stream = await this.openai.chat.completions.create({
      model: this.chatModel,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.1,
      max_tokens: 1024,
    });

    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    const textStream = async function* () {
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          yield content;
        }

        // Capture usage from the final chunk
        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }
      }
    };

    return {
      stream: textStream(),
      getUsage: async () => usage,
    };
  }

  /**
   * Extract confidence score from the LLM response.
   * Looks for [CONFIDENCE: X.X] pattern.
   */
  extractConfidence(response: string): number {
    const match = response.match(/\[CONFIDENCE:\s*([\d.]+)\]/i);
    if (match) {
      const score = parseFloat(match[1]);
      return Math.min(Math.max(score, 0), 1);
    }
    return 0.5; // Default medium confidence
  }

  /**
   * Remove the confidence tag from the response text.
   */
  cleanResponse(response: string): string {
    return response.replace(/\[CONFIDENCE:\s*[\d.]+\]/gi, '').trim();
  }
}
