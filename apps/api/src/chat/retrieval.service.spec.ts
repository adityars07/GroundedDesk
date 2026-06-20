import { Test, TestingModule } from '@nestjs/testing';
import { RetrievalService, RetrievedChunk } from './retrieval.service';
import { QdrantService } from '../knowledge/qdrant.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('RetrievalService', () => {
  let service: RetrievalService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetrievalService,
        {
          provide: QdrantService,
          useValue: {
            search: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RetrievalService>(RetrievalService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should fall back to cosine sorting when COHERE_API_KEY is not set', async () => {
    jest.spyOn(configService, 'get').mockReturnValue(undefined);

    const chunks: RetrievedChunk[] = [
      { chunkId: '1', sourceId: 's1', sourceName: 'Doc A', content: 'hello', relevanceScore: 0.4 },
      { chunkId: '2', sourceId: 's1', sourceName: 'Doc A', content: 'world', relevanceScore: 0.8 },
      { chunkId: '3', sourceId: 's1', sourceName: 'Doc A', content: 'foo', relevanceScore: 0.2 },
    ];

    const result = await service.rerank('query', chunks, 0.3);

    expect(result).toHaveLength(2);
    expect(result[0].chunkId).toBe('2');
    expect(result[1].chunkId).toBe('1');
  });

  it('should call Cohere Rerank API and return ranked results when COHERE_API_KEY is set', async () => {
    jest.spyOn(configService, 'get').mockReturnValue('cohere-api-key');

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        results: [
          { index: 1, relevance_score: 0.95 },
          { index: 0, relevance_score: 0.85 },
        ],
      }),
    });
    global.fetch = mockFetch;

    const chunks: RetrievedChunk[] = [
      { chunkId: '1', sourceId: 's1', sourceName: 'Doc A', content: 'hello', relevanceScore: 0.4 },
      { chunkId: '2', sourceId: 's1', sourceName: 'Doc A', content: 'world', relevanceScore: 0.8 },
    ];

    const result = await service.rerank('query', chunks, 0.3);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.cohere.ai/v1/rerank',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          model: 'rerank-english-v3.0',
          query: 'query',
          documents: ['hello', 'world'],
          top_n: 5,
        }),
      }),
    );

    expect(result).toHaveLength(2);
    expect(result[0].chunkId).toBe('2');
    expect(result[0].relevanceScore).toBe(0.95);
    expect(result[1].chunkId).toBe('1');
    expect(result[1].relevanceScore).toBe(0.85);
  });
});
