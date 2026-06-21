import { Test, TestingModule } from '@nestjs/testing';
import { ToolExecutorService } from './tool-executor.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationStatus } from '@prisma/client';

describe('ToolExecutorService', () => {
  let service: ToolExecutorService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolExecutorService,
        {
          provide: PrismaService,
          useValue: {
            conversation: {
              update: jest.fn(),
            },
            message: {
              create: jest.fn(),
            },
            user: {
              findFirst: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ToolExecutorService>(ToolExecutorService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should return tool definitions', () => {
    const definitions = service.getToolDefinitions();
    expect(definitions).toHaveLength(3);
    expect(definitions.map((d) => d.name)).toContain('track_order');
    expect(definitions.map((d) => d.name)).toContain('escalate_to_human');
    expect(definitions.map((d) => d.name)).toContain('update_customer_crm');
  });

  it('should track order with dynamic states', async () => {
    const res1 = await service.executeTool('track_order', { orderId: 'ACME-1234' }, 'tenant-1');
    expect(res1.status).toBe('DELIVERED');
    expect(res1.carrier).toBe('FedEx');

    const resError = await service.executeTool('track_order', { orderId: '' }, 'tenant-1');
    expect(resError.status).toBe('ERROR');
  });

  it('should escalate to human', async () => {
    const updateSpy = jest.spyOn(prisma.conversation, 'update').mockResolvedValue({} as any);
    const createSpy = jest.spyOn(prisma.message, 'create').mockResolvedValue({} as any);

    const res = await service.executeTool(
      'escalate_to_human',
      { reason: 'Dispute' },
      'tenant-1',
      'conversation-1',
    );

    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: { status: ConversationStatus.ESCALATED },
    });
    expect(createSpy).toHaveBeenCalledWith({
      data: {
        conversationId: 'conversation-1',
        tenantId: 'tenant-1',
        role: 'SYSTEM',
        content: 'Conversation escalated to human agent. Reason: Dispute',
      },
    });
    expect(res.status).toBe('SUCCESS');
  });
});
