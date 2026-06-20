import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeService } from './knowledge.service';
import { PrismaService } from '../prisma/prisma.service';
import { IngestionProducer } from './ingestion/ingestion.producer';
import { QdrantService } from './qdrant.service';
import { SourceStatus } from '@prisma/client';

describe('KnowledgeVersioning', () => {
  let service: KnowledgeService;
  let prisma: PrismaService;
  let qdrant: QdrantService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeService,
        {
          provide: PrismaService,
          useValue: {
            knowledgeSource: {
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
            chunk: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: QdrantService,
          useValue: {
            deleteVectors: jest.fn(),
          },
        },
        {
          provide: IngestionProducer,
          useValue: {
            queueParse: jest.fn(),
            queueCrawl: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<KnowledgeService>(KnowledgeService);
    prisma = module.get<PrismaService>(PrismaService);
    qdrant = module.get<QdrantService>(QdrantService);
  });

  it('should create version 1 if no existing source exists', async () => {
    jest.spyOn(prisma.knowledgeSource, 'findFirst').mockResolvedValue(null);
    jest.spyOn(prisma.knowledgeSource, 'create').mockResolvedValue({ id: 'new-id' } as any);

    const file = {
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      size: 100,
      buffer: Buffer.from('test'),
    } as Express.Multer.File;

    await service.uploadFile('tenant-1', file);

    expect(prisma.knowledgeSource.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 1,
        previousVersionId: null,
      }),
    });
  });

  it('should increment version and archive old source if it exists', async () => {
    const existingSource = {
      id: 'old-id',
      version: 2,
    };

    jest.spyOn(prisma.knowledgeSource, 'findFirst').mockResolvedValue(existingSource as any);
    jest.spyOn(prisma.chunk, 'findMany').mockResolvedValue([{ vectorId: 'vec-1' }] as any);
    jest.spyOn(prisma.knowledgeSource, 'create').mockResolvedValue({ id: 'new-id' } as any);

    const file = {
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      size: 100,
      buffer: Buffer.from('test'),
    } as Express.Multer.File;

    await service.uploadFile('tenant-1', file);

    expect(prisma.knowledgeSource.update).toHaveBeenCalledWith({
      where: { id: 'old-id' },
      data: { status: SourceStatus.ARCHIVED },
    });

    expect(qdrant.deleteVectors).toHaveBeenCalledWith(['vec-1']);

    expect(prisma.knowledgeSource.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 3,
        previousVersionId: 'old-id',
      }),
    });
  });
});
