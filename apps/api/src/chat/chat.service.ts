import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService, RetrievedChunk } from './retrieval.service';
import { LlmService } from './llm.service';
import { MessageRole } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { InjectionFilter } from '../guardrail/injection-filter';
import { PiiRedactor } from '../guardrail/pii-redactor';
import { LangfuseService } from '../observability/langfuse.service';

export interface ChatResult {
  conversationId: string;
  messageId: string;
  stream: AsyncIterable<string>;
  onComplete: () => Promise<{
    fullResponse: string;
    citations: RetrievedChunk[];
    confidence: number;
    tokenCost: number;
    latencyMs: number;
  }>;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly retrievalService: RetrievalService,
    private readonly llmService: LlmService,
    private readonly injectionFilter: InjectionFilter,
    private readonly piiRedactor: PiiRedactor,
    private readonly langfuseService: LangfuseService,
  ) {}

  /**
   * Process a chat message through the full RAG pipeline.
   * Returns a streaming result that the gateway can forward to the client.
   */
  async processMessage(
    tenantId: string,
    sessionId: string,
    userMessage: string,
    conversationId?: string,
    visitorInfo?: Record<string, any>,
  ): Promise<ChatResult> {
    const startTime = Date.now();

    // Check for prompt injection
    const isInjection = await this.injectionFilter.isInjection(userMessage);
    if (isInjection) {
      throw new Error('PROMPT_INJECTION_DETECTED');
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await this.prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
      });
    }

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          tenantId,
          sessionId,
          visitorInfo: visitorInfo || {},
        },
      });
    }

    // Start Langfuse trace
    const trace = this.langfuseService.createTrace({
      name: 'chat-message',
      userId: sessionId,
      sessionId: conversation.id,
      metadata: { tenantId },
    });

    // Save user message
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        tenantId,
        role: MessageRole.USER,
        content: userMessage,
      },
    });

    // Get tenant settings
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    // Get conversation history (last 10 messages for context)
    const history = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    // Redact PII from user query and history before sending to LLM/embeddings
    const redactedUserMessage = this.piiRedactor.redact(userMessage);

    const generation = trace
      ? trace.generation({
          name: 'openai-completion',
          model: 'gpt-4o',
          input: redactedUserMessage,
        })
      : null;

    const conversationHistory = history
      .filter((m) => m.role !== MessageRole.SYSTEM)
      .map((m) => ({
        role: m.role === MessageRole.USER ? 'user' as const : 'assistant' as const,
        content: m.role === MessageRole.USER ? this.piiRedactor.redact(m.content) : m.content,
      }));

    // Generate query embedding
    const queryEmbedding = await this.llmService.embedQuery(redactedUserMessage);

    // Retrieve relevant chunks
    const rawChunks = await this.retrievalService.retrieve(tenantId, queryEmbedding, 5);
    const chunks = this.retrievalService.rerank(rawChunks);

    // Build system prompt with context
    const systemPrompt = this.llmService.buildSystemPrompt(
      chunks,
      tenant?.settings,
    );

    // Stream completion
    const messageId = uuidv4();
    const { stream, getUsage } = await this.llmService.streamCompletion(
      systemPrompt,
      redactedUserMessage,
      conversationHistory.slice(0, -1), // Exclude the just-added user message
    );

    let fullResponse = '';

    // Wrap the stream to accumulate the full response
    const wrappedStream = async function* () {
      for await (const chunk of stream) {
        fullResponse += chunk;
        yield chunk;
      }
    };

    return {
      conversationId: conversation.id,
      messageId,
      stream: wrappedStream(),
      onComplete: async () => {
        const usage = await getUsage();
        const latencyMs = Date.now() - startTime;
        const confidence = this.llmService.extractConfidence(fullResponse);
        const cleanedResponse = this.llmService.cleanResponse(fullResponse);

        // Calculate cost (GPT-4o pricing: $2.50/1M input, $10/1M output)
        const inputCostPerToken = 0.0000025;
        const outputCostPerToken = 0.00001;
        const tokenCost =
          usage.promptTokens * inputCostPerToken +
          usage.completionTokens * outputCostPerToken;

        // Save assistant message
        await this.prisma.message.create({
          data: {
            id: messageId,
            conversationId: conversation.id,
            tenantId,
            role: MessageRole.ASSISTANT,
            content: cleanedResponse,
            citations: chunks.map((c) => ({
              chunkId: c.chunkId,
              sourceId: c.sourceId,
              sourceName: c.sourceName,
              content: c.content.substring(0, 200),
              relevanceScore: c.relevanceScore,
            })),
            confidence,
            tokenCost,
            latencyMs,
          },
        });

        // End generation trace
        if (generation) {
          generation.end({
            output: cleanedResponse,
            usage: {
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
            },
          });
        }

        // Log cost
        await this.prisma.costLog.create({
          data: {
            tenantId,
            conversationId: conversation.id,
            model: 'gpt-4o',
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalCost: tokenCost,
            operation: 'chat',
          },
        });

        return {
          fullResponse: cleanedResponse,
          citations: chunks,
          confidence,
          tokenCost,
          latencyMs,
        };
      },
    };
  }
}
