import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService, RetrievedChunk } from './retrieval.service';
import { LlmService, computeTokenCost } from './llm.service';
import { MessageRole } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { InjectionFilter } from '../guardrail/injection-filter';
import { PiiRedactor } from '../guardrail/pii-redactor';
import { LangfuseService } from '../observability/langfuse.service';
import { BillingService } from '../billing/billing.service';
import { ToolExecutorService } from './tools/tool-executor.service';

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
    pendingToolCalls?: any[];
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
    private readonly toolExecutor: ToolExecutorService,
    @Optional() private readonly billingService?: BillingService,
  ) {}

  private getToolPolicy(tenantSettings: any, toolName: string): 'auto' | 'confirm' {
    if (tenantSettings?.toolPolicies && tenantSettings.toolPolicies[toolName]) {
      return tenantSettings.toolPolicies[toolName] === 'auto' ? 'auto' : 'confirm';
    }
    if (toolName === 'track_order') {
      return 'auto';
    }
    return 'confirm';
  }

  private parseArgs(argsStr: string): any {
    try {
      return JSON.parse(argsStr);
    } catch {
      return {};
    }
  }

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
    attachments?: Array<{ name: string; url: string; mimeType: string }>,
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
        attachments: attachments || [],
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

    const redactedUserMessage = this.piiRedactor.redact(userMessage);

    const generation = trace
      ? trace.generation({
          name: 'gemini-completion',
          model: 'gemini-1.5-flash',
          input: redactedUserMessage,
        })
      : null;

    let currentHistory = history.map((m) => {
      if (m.role === MessageRole.USER) {
        return { role: 'user' as const, content: this.piiRedactor.redact(m.content) };
      } else if (m.role === MessageRole.SYSTEM) {
        return { role: 'user' as const, content: `[System Notification/Tool Result]: ${m.content}` };
      } else {
        return { role: 'assistant' as const, content: m.content };
      }
    });

    let attachmentsForTurn = attachments;
    let finalCitations: RetrievedChunk[] = [];
    let finalConfidence = 0.5;
    let finalCost = 0;
    let finalLatency = 0;
    let finalCleanedResponse = '';
    let pendingToolCallsToEmit: any[] = [];

    const self = this;
    const messageId = uuidv4();

    const wrappedStream = async function* () {
      let turn = 0;
      let done = false;

      while (!done && turn < 3) {
        turn++;

        const lastUserMsg = [...currentHistory].reverse().find(m => m.role === 'user');
        const queryText = lastUserMsg ? lastUserMsg.content : redactedUserMessage;

        const queryEmbedding = await self.llmService.embedQuery(queryText);
        const rawChunks = await self.retrievalService.retrieve(tenantId, queryEmbedding, 20);
        const chunks = await self.retrievalService.rerank(queryText, rawChunks);
        const systemPrompt = self.llmService.buildSystemPrompt(chunks, tenant?.settings);

        const { stream, getUsage, providerName, modelName, toolCalls } = await self.llmService.streamCompletion(
          systemPrompt,
          queryText,
          currentHistory.slice(0, -1),
          tenant?.settings,
          { attachments: attachmentsForTurn, tools: self.toolExecutor.getToolDefinitions() },
        );

        let turnText = '';
        for await (const chunk of stream) {
          turnText += chunk;
          yield chunk;
        }

        const usage = await getUsage();
        const confidence = self.llmService.extractConfidence(turnText);
        const cleanedResponse = self.llmService.cleanResponse(turnText);
        const tokenCost = computeTokenCost(modelName, usage.promptTokens, usage.completionTokens);

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

        await self.prisma.costLog.create({
          data: {
            tenantId,
            conversationId: conversation.id,
            model: modelName,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalCost: tokenCost,
            operation: `chat:${providerName}`,
          },
        });

        if (toolCalls && toolCalls.length > 0) {
          self.logger.log(`LLM requested tool calls: ${JSON.stringify(toolCalls)}`);

          const settings = tenant?.settings as any;
          const pendingCalls: any[] = [];
          const autoCalls: any[] = [];

          for (const tc of toolCalls) {
            const policy = self.getToolPolicy(settings, tc.name);
            if (policy === 'confirm') {
              pendingCalls.push(tc);
            } else {
              autoCalls.push(tc);
            }
          }

          if (pendingCalls.length > 0) {
            await self.prisma.message.create({
              data: {
                conversationId: conversation.id,
                tenantId,
                role: MessageRole.ASSISTANT,
                content: `Requested tool calls: ${toolCalls.map(t => t.name).join(', ')}`,
              },
            });

            const pendingMessages: any[] = [];
            for (const tc of pendingCalls) {
              const msg = await self.prisma.message.create({
                data: {
                  conversationId: conversation.id,
                  tenantId,
                  role: MessageRole.SYSTEM,
                  content: `PENDING_TOOL_CALL:${JSON.stringify({ id: tc.id, name: tc.name, arguments: tc.arguments })}`,
                },
              });
              pendingMessages.push({ ...tc, messageId: msg.id });
            }

            finalCitations = chunks;
            finalConfidence = 1.0;
            finalCost += tokenCost;
            finalLatency = Date.now() - startTime;
            finalCleanedResponse = '';
            pendingToolCallsToEmit = pendingMessages;

            done = true;
          } else {
            await self.prisma.message.create({
              data: {
                conversationId: conversation.id,
                tenantId,
                role: MessageRole.ASSISTANT,
                content: `Executing tool calls: ${toolCalls.map(t => t.name).join(', ')}`,
              },
            });

            for (const tc of autoCalls) {
              const parsedArgs = self.parseArgs(tc.arguments);
              const result = await self.toolExecutor.executeTool(tc.name, parsedArgs, tenantId, conversation.id);

              await self.prisma.message.create({
                data: {
                  conversationId: conversation.id,
                  tenantId,
                  role: MessageRole.SYSTEM,
                  content: `TOOL_CALL_RESULT:${JSON.stringify({ id: tc.id, name: tc.name, result })}`,
                },
              });
            }

            const updatedHistory = await self.prisma.message.findMany({
              where: { conversationId: conversation.id },
              orderBy: { createdAt: 'asc' },
              take: 10,
            });

            currentHistory = updatedHistory.map((m) => {
              if (m.role === MessageRole.USER) {
                return { role: 'user' as const, content: self.piiRedactor.redact(m.content) };
              } else if (m.role === MessageRole.SYSTEM) {
                return { role: 'user' as const, content: `[System Notification/Tool Result]: ${m.content}` };
              } else {
                return { role: 'assistant' as const, content: m.content };
              }
            });

            attachmentsForTurn = [];
            finalCost += tokenCost;
          }
        } else {
          await self.prisma.message.create({
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
              latencyMs: Date.now() - startTime,
            },
          });

          finalCitations = chunks;
          finalConfidence = confidence;
          finalCost += tokenCost;
          finalLatency = Date.now() - startTime;
          finalCleanedResponse = cleanedResponse;

          done = true;
        }
      }
    };

    return {
      conversationId: conversation.id,
      messageId,
      stream: wrappedStream(),
      onComplete: async () => {
        self.billingService?.reportUsage(tenantId, 1).catch(() => {});

        return {
          fullResponse: finalCleanedResponse,
          citations: finalCitations,
          confidence: finalConfidence,
          tokenCost: finalCost,
          latencyMs: finalLatency,
          pendingToolCalls: pendingToolCallsToEmit.length > 0 ? pendingToolCallsToEmit : undefined,
        };
      },
    };
  }

  /**
   * Continue the conversation turn after tool results are available.
   */
  async continueConversation(
    tenantId: string,
    conversationId: string,
  ): Promise<ChatResult> {
    const startTime = Date.now();

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    const trace = this.langfuseService.createTrace({
      name: 'chat-message-continue',
      sessionId: conversation.id,
      metadata: { tenantId },
    });

    let finalCitations: RetrievedChunk[] = [];
    let finalConfidence = 0.5;
    let finalCost = 0;
    let finalLatency = 0;
    let finalCleanedResponse = '';
    let pendingToolCallsToEmit: any[] = [];

    const self = this;
    const messageId = uuidv4();

    const wrappedStream = async function* () {
      let turn = 0;
      let done = false;

      const history = await self.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });

      let currentHistory = history.map((m) => {
        if (m.role === MessageRole.USER) {
          return { role: 'user' as const, content: self.piiRedactor.redact(m.content) };
        } else if (m.role === MessageRole.SYSTEM) {
          return { role: 'user' as const, content: `[System Notification/Tool Result]: ${m.content}` };
        } else {
          return { role: 'assistant' as const, content: m.content };
        }
      });

      while (!done && turn < 3) {
        turn++;

        const lastUserMsg = [...currentHistory].reverse().find(m => m.role === 'user');
        const queryText = lastUserMsg ? lastUserMsg.content : 'Continue';

        const queryEmbedding = await self.llmService.embedQuery(queryText);
        const rawChunks = await self.retrievalService.retrieve(tenantId, queryEmbedding, 20);
        const chunks = await self.retrievalService.rerank(queryText, rawChunks);
        const systemPrompt = self.llmService.buildSystemPrompt(chunks, tenant?.settings);

        const { stream, getUsage, providerName, modelName, toolCalls } = await self.llmService.streamCompletion(
          systemPrompt,
          queryText,
          currentHistory.slice(0, -1),
          tenant?.settings,
          { tools: self.toolExecutor.getToolDefinitions() },
        );

        let turnText = '';
        for await (const chunk of stream) {
          turnText += chunk;
          yield chunk;
        }

        const usage = await getUsage();
        const confidence = self.llmService.extractConfidence(turnText);
        const cleanedResponse = self.llmService.cleanResponse(turnText);
        const tokenCost = computeTokenCost(modelName, usage.promptTokens, usage.completionTokens);

        await self.prisma.costLog.create({
          data: {
            tenantId,
            conversationId: conversation.id,
            model: modelName,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalCost: tokenCost,
            operation: `chat:${providerName}`,
          },
        });

        if (toolCalls && toolCalls.length > 0) {
          self.logger.log(`LLM requested tool calls during continue: ${JSON.stringify(toolCalls)}`);

          const settings = tenant?.settings as any;
          const pendingCalls: any[] = [];
          const autoCalls: any[] = [];

          for (const tc of toolCalls) {
            const policy = self.getToolPolicy(settings, tc.name);
            if (policy === 'confirm') {
              pendingCalls.push(tc);
            } else {
              autoCalls.push(tc);
            }
          }

          if (pendingCalls.length > 0) {
            await self.prisma.message.create({
              data: {
                conversationId: conversation.id,
                tenantId,
                role: MessageRole.ASSISTANT,
                content: `Requested tool calls: ${toolCalls.map(t => t.name).join(', ')}`,
              },
            });

            const pendingMessages: any[] = [];
            for (const tc of pendingCalls) {
              const msg = await self.prisma.message.create({
                data: {
                  conversationId: conversation.id,
                  tenantId,
                  role: MessageRole.SYSTEM,
                  content: `PENDING_TOOL_CALL:${JSON.stringify({ id: tc.id, name: tc.name, arguments: tc.arguments })}`,
                },
              });
              pendingMessages.push({ ...tc, messageId: msg.id });
            }

            finalCitations = chunks;
            finalConfidence = 1.0;
            finalCost += tokenCost;
            finalLatency = Date.now() - startTime;
            finalCleanedResponse = '';
            pendingToolCallsToEmit = pendingMessages;

            done = true;
          } else {
            await self.prisma.message.create({
              data: {
                conversationId: conversation.id,
                tenantId,
                role: MessageRole.ASSISTANT,
                content: `Executing tool calls: ${toolCalls.map(t => t.name).join(', ')}`,
              },
            });

            for (const tc of autoCalls) {
              const parsedArgs = self.parseArgs(tc.arguments);
              const result = await self.toolExecutor.executeTool(tc.name, parsedArgs, tenantId, conversation.id);

              await self.prisma.message.create({
                data: {
                  conversationId: conversation.id,
                  tenantId,
                  role: MessageRole.SYSTEM,
                  content: `TOOL_CALL_RESULT:${JSON.stringify({ id: tc.id, name: tc.name, result })}`,
                },
              });
            }

            const updatedHistory = await self.prisma.message.findMany({
              where: { conversationId: conversation.id },
              orderBy: { createdAt: 'asc' },
              take: 10,
            });

            currentHistory = updatedHistory.map((m) => {
              if (m.role === MessageRole.USER) {
                return { role: 'user' as const, content: self.piiRedactor.redact(m.content) };
              } else if (m.role === MessageRole.SYSTEM) {
                return { role: 'user' as const, content: `[System Notification/Tool Result]: ${m.content}` };
              } else {
                return { role: 'assistant' as const, content: m.content };
              }
            });

            finalCost += tokenCost;
          }
        } else {
          await self.prisma.message.create({
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
              latencyMs: Date.now() - startTime,
            },
          });

          finalCitations = chunks;
          finalConfidence = confidence;
          finalCost += tokenCost;
          finalLatency = Date.now() - startTime;
          finalCleanedResponse = cleanedResponse;

          done = true;
        }
      }
    };

    return {
      conversationId: conversation.id,
      messageId,
      stream: wrappedStream(),
      onComplete: async () => {
        self.billingService?.reportUsage(tenantId, 1).catch(() => {});

        return {
          fullResponse: finalCleanedResponse,
          citations: finalCitations,
          confidence: finalConfidence,
          tokenCost: finalCost,
          latencyMs: finalLatency,
          pendingToolCalls: pendingToolCallsToEmit.length > 0 ? pendingToolCallsToEmit : undefined,
        };
      },
    };
  }
}
