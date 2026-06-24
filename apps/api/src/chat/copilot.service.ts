import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server } from 'socket.io';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService } from './retrieval.service';
import { LlmService } from './llm.service';

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);
  private readonly geminiClient: OpenAI;
  private readonly chatModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly retrievalService: RetrievalService,
    private readonly llmService: LlmService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.geminiClient = new OpenAI({
      apiKey: apiKey || 'dummy-key',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
    this.chatModel = this.configService.get<string>('GEMINI_CHAT_MODEL', 'gemini-1.5-flash');
  }

  async generateSuggestions(
    conversationId: string,
    customerQuery: string,
  ): Promise<string[]> {
    try {
      // 1. Get conversation history (last 5 messages)
      const history = await this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: 5,
      });

      const historyText = history
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n');

      // 2. Fetch context via RAG
      const queryEmbedding = await this.llmService.embedQuery(customerQuery);
      const rawChunks = await this.retrievalService.retrieve(
        history[0]?.tenantId || '',
        queryEmbedding,
        5,
      );
      const contextText = rawChunks
        .map((c) => `[Source: ${c.sourceName}]\n${c.content}`)
        .join('\n\n');

      // 3. Build prompt for suggestions
      const systemPrompt = `You are an AI Co-pilot helping a human customer support agent.
Based on the customer's query, the conversation history, and the provided knowledge base context, generate 3 distinct suggested replies that the human agent can use.

RULES:
1. Provide exactly 3 suggestions.
2. Format the output as a valid JSON array of strings: ["Suggestion 1", "Suggestion 2", "Suggestion 3"].
3. Each suggestion should be professional, short (1-3 sentences), and directly answer the customer.
4. Do not include any JSON markdown wrapping (e.g. no \`\`\`json) or other text, just the raw JSON array.
5. Use the knowledge base context below to ensure accuracy.

CONTEXT:
${contextText}

CONVERSATION HISTORY:
${historyText}

CUSTOMER'S LATEST QUERY:
${customerQuery}`;

      // 4. Query Gemini
      const response = await this.geminiClient.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: 'system', content: systemPrompt },
        ],
        temperature: 0.3,
        max_tokens: 300,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) return [];

      // Clean markdown if the LLM ignored instructions
      const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const suggestions = JSON.parse(cleaned);

      if (Array.isArray(suggestions)) {
        return suggestions;
      }
      return [];
    } catch (err) {
      this.logger.error('Failed to generate suggestions', err);
      return [];
    }
  }

  async generateSuggestionAndEmit(
    conversationId: string,
    customerQuery: string,
    server: Server,
  ): Promise<void> {
    // Only generate suggestions for escalated conversations where human agents are active
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation || conversation.status !== 'ESCALATED') {
      return;
    }

    this.logger.log(`Generating copilot suggestions for conversation ${conversationId}...`);
    const suggestions = await this.generateSuggestions(conversationId, customerQuery);
    
    if (suggestions.length > 0) {
      this.logger.log(`Emitting ${suggestions.length} suggestions for conversation ${conversationId}`);
      server.to(`conv:${conversationId}`).emit('copilot:suggestions', {
        conversationId,
        suggestions,
      });
    }
  }
}
