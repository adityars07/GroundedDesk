import { Test, TestingModule } from '@nestjs/testing';
import { GapAnalyzerService } from './gap-analyzer.service';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../chat/llm.service';
import { MessageRole } from '@prisma/client';

describe('GapAnalyzerService', () => {
  let service: GapAnalyzerService;
  let prisma: PrismaService;
  let llmService: LlmService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GapAnalyzerService,
        {
          provide: PrismaService,
          useValue: {
            tenant: {
              findUnique: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
            message: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
            },
          },
        },
        {
          provide: LlmService,
          useValue: {
            streamCompletion: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GapAnalyzerService>(GapAnalyzerService);
    prisma = module.get<PrismaService>(PrismaService);
    llmService = module.get<LlmService>(LlmService);
  });

  it('should return mock gaps if no low-confidence messages exist', async () => {
    jest.spyOn(prisma.message, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: 'tenant-1', settings: {} } as any);
    const updateSpy = jest.spyOn(prisma.tenant, 'update').mockResolvedValue({} as any);

    const gaps = await service.analyzeGaps('tenant-1');
    expect(gaps).toHaveLength(3);
    expect(gaps[0].topic).toBe('Corporate Gifting & Bulk Discounts');
    expect(updateSpy).toHaveBeenCalled();
  });

  it('should cluster questions and update tenant settings via LLM when low-confidence messages exist', async () => {
    // 1. Mock low confidence assistant messages
    const mockMsg1 = { id: 'm1', conversationId: 'c1', role: MessageRole.ASSISTANT, confidence: 0.4, createdAt: new Date() };
    jest.spyOn(prisma.message, 'findMany').mockResolvedValue([mockMsg1] as any);

    // 2. Mock preceding user message
    const mockUserMsg = {
      id: 'm0',
      conversationId: 'c1',
      role: MessageRole.USER,
      content: 'Do you ship to Germany?',
      createdAt: new Date(Date.now() - 1000),
    };
    jest.spyOn(prisma.message, 'findFirst').mockResolvedValue(mockUserMsg as any);

    // 3. Mock tenant findUnique
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: 'tenant-1', settings: {} } as any);

    // 4. Mock LLM streamCompletion
    const mockStream = async function* () {
      yield JSON.stringify([
        {
          id: 'gap-1',
          topic: 'International shipping',
          description: 'Questions about shipping to Germany and EU.',
          queryCount: 5,
          sampleQueries: ['Do you ship to Germany?'],
        },
      ]);
    };

    jest.spyOn(llmService, 'streamCompletion').mockResolvedValue({
      stream: mockStream(),
      getUsage: jest.fn().mockResolvedValue({ promptTokens: 10, completionTokens: 10, totalTokens: 20 }),
      providerName: 'openai',
      modelName: 'gpt-4o',
    } as any);

    const updateSpy = jest.spyOn(prisma.tenant, 'update').mockResolvedValue({} as any);

    const gaps = await service.analyzeGaps('tenant-1');
    expect(gaps).toHaveLength(1);
    expect(gaps[0].topic).toBe('International shipping');
    expect(updateSpy).toHaveBeenCalled();
  });
});
