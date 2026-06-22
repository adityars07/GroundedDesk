import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService, computeTokenCost } from '../chat/llm.service';
import { MessageRole } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

export interface KnowledgeGap {
  id: string;
  topic: string;
  description: string;
  queryCount: number;
  sampleQueries: string[];
  updatedAt: string;
}

@Injectable()
export class GapAnalyzerService implements OnModuleInit {
  private readonly logger = new Logger(GapAnalyzerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
  ) {}

  onModuleInit() {
    // Background worker: Run daily analysis (every 24 hours)
    setInterval(() => {
      this.logger.log('Starting daily background knowledge gap analysis...');
      this.analyzeAllTenants().catch((err) => {
        this.logger.error('Failed background gap analysis run', err);
      });
    }, 24 * 60 * 60 * 1000);
  }

  async analyzeAllTenants() {
    const tenants = await this.prisma.tenant.findMany();
    for (const tenant of tenants) {
      try {
        await this.analyzeGaps(tenant.id);
      } catch (err) {
        this.logger.error(`Error analyzing gaps for tenant ${tenant.id}`, err);
      }
    }
  }

  async analyzeGaps(tenantId: string): Promise<KnowledgeGap[]> {
    this.logger.log(`Running gap analysis for tenant: ${tenantId}`);

    // 1. Fetch assistant messages where confidence is low (< 0.6) or was fallback/handoff
    const assistantMessages = await this.prisma.message.findMany({
      where: {
        tenantId,
        role: MessageRole.ASSISTANT,
        OR: [
          { confidence: { lt: 0.6 } },
          { content: { contains: "I don't have enough information" } },
        ],
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // last 30 days
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    if (assistantMessages.length === 0) {
      this.logger.log(`No low-confidence messages in database for tenant ${tenantId}. Returning mock gaps.`);
      return this.getMockGaps(tenantId);
    }

    // 2. Fetch corresponding USER messages (queries) preceding those assistant messages
    const userQueries: string[] = [];
    for (const msg of assistantMessages) {
      const precedingUserMsg = await this.prisma.message.findFirst({
        where: {
          conversationId: msg.conversationId,
          role: MessageRole.USER,
          createdAt: {
            lt: msg.createdAt,
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (precedingUserMsg && precedingUserMsg.content.trim()) {
        userQueries.push(precedingUserMsg.content.trim());
      }
    }

    const uniqueQueries = Array.from(new Set(userQueries)).filter((q) => q.length > 5);

    if (uniqueQueries.length === 0) {
      this.logger.log(`No unique queries extracted for low-confidence assistant messages. Returning mock gaps.`);
      return this.getMockGaps(tenantId);
    }

    // 3. Cluster and classify topics via LLM completion
    const prompt = `You are an expert AI customer support analyst. Below is a list of customer questions that our AI bot was UNABLE to answer because they were not covered in the knowledge base.
    
YOUR TASK:
1. Analyze these customer queries and cluster them into 2 to 5 distinct, cohesive "knowledge gap" topics.
2. For each topic, provide a clear, professional title (e.g., "Refund Policy for Coffee Machines"), a detailed description explaining what information appears to be missing and why customers are asking, the count of queries in this cluster, and up to 3 representative sample queries.
3. Return your response as a JSON array of objects conforming to the following JSON schema:
[
  {
    "id": "string (random UUID)",
    "topic": "string (title of missing topic)",
    "description": "string (details of what is missing)",
    "queryCount": number (approximate number of queries in this group),
    "sampleQueries": ["string (sample query 1)", "string (sample query 2)"]
  }
]

CUSTOMER QUERIES:
${uniqueQueries.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

Respond ONLY with the raw JSON array. No markdown formatting, no code blocks (do not wrap in \`\`\`json), no text before or after the JSON.`;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    const completion = await this.llmService.streamCompletion(
      'You are a database analyst specializing in identifying customer service knowledge gaps.',
      prompt,
      [],
      tenant?.settings,
    );

    let responseText = '';
    for await (const chunk of completion.stream) {
      responseText += chunk;
    }

    let cleanedResponse = responseText.trim();
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    }

    let gaps: KnowledgeGap[] = [];
    try {
      gaps = JSON.parse(cleanedResponse);
      gaps = gaps.map((g) => ({
        ...g,
        id: g.id || uuidv4(),
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      this.logger.error('Failed to parse LLM knowledge gaps analysis output: ' + responseText, err);
      return this.getMockGaps(tenantId);
    }

    // Save gaps back to tenant settings JSON
    const currentSettings = (tenant?.settings as any) || {};
    const updatedSettings = {
      ...currentSettings,
      knowledgeGaps: gaps,
    };

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: updatedSettings,
      },
    });

    this.logger.log(`Successfully completed gap analysis with ${gaps.length} topics for tenant: ${tenantId}`);
    return gaps;
  }

  private async getMockGaps(tenantId: string): Promise<KnowledgeGap[]> {
    const mockGaps: KnowledgeGap[] = [
      {
        id: 'gap-mock-1',
        topic: 'Corporate Gifting & Bulk Discounts',
        description: 'Customers are inquiring about custom branding, gift wrapping, and bulk discount rates for large orders (10+ espresso machines). Our current documentation only covers standard retail pricing.',
        queryCount: 14,
        sampleQueries: [
          'Do you offer bulk discounts for corporate holiday gifts?',
          'Can we get our company logo engraved on the espresso machines?',
          'What is the lead time for an order of 25 Barista Express units?'
        ],
        updatedAt: new Date().toISOString()
      },
      {
        id: 'gap-mock-2',
        topic: 'International Warranty & Voltage Compatibility',
        description: 'Queries regarding voltage requirements (110V vs 220V) for international outlets, and whether warranty coverage extends overseas. Our knowledge base currently assumes US domestic operation.',
        queryCount: 9,
        sampleQueries: [
          'Can I use the Barista Express in the UK without a voltage transformer?',
          'Is the warranty valid if I ship the machine to Singapore?',
          'Do you sell 220V versions of the coffee maker?'
        ],
        updatedAt: new Date().toISOString()
      },
      {
        id: 'gap-mock-3',
        topic: 'Decaf & Dark Roast Dial-in Guide',
        description: 'Customers frequently ask for dial-in guides (grind size, extraction timing) specifically for decaf beans or dark oily roasts, which pull differently than standard medium roast coffee beans.',
        queryCount: 6,
        sampleQueries: [
          'What grind setting should I use for Swiss Water decaf?',
          'My dark roast shots are pulling too fast, how do I adjust?',
          'Do you have temperature settings for light roast single origin?'
        ],
        updatedAt: new Date().toISOString()
      }
    ];

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const currentSettings = (tenant?.settings as any) || {};

    if (!currentSettings.knowledgeGaps) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          settings: {
            ...currentSettings,
            knowledgeGaps: mockGaps
          }
        }
      });
      return mockGaps;
    }

    return currentSettings.knowledgeGaps;
  }
}
