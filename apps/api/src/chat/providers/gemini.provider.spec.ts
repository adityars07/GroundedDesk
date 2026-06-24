import { Test, TestingModule } from '@nestjs/testing';
import { GeminiProvider } from './gemini.provider';
import { ConfigService } from '@nestjs/config';

// Mock OpenAI SDK
const mockEmbeddingsCreate = jest.fn();
const mockCompletionsCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => {
    return {
      embeddings: {
        create: mockEmbeddingsCreate,
      },
      chat: {
        completions: {
          create: mockCompletionsCreate,
        },
      },
    };
  });
});

// Mock langfuse module to avoid ESM runtime import issues in Jest
jest.mock('langfuse', () => {
  return {
    Langfuse: jest.fn().mockImplementation(() => {
      return {
        createSpan: jest.fn(),
        updateSpan: jest.fn(),
      };
    }),
  };
});

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key, defaultValue) => {
              if (key === 'GEMINI_API_KEY') return 'test-gemini-key';
              if (key === 'GEMINI_CHAT_MODEL') return 'gemini-1.5-flash';
              if (key === 'GEMINI_EMBEDDING_MODEL') return 'gemini-embedding-001';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<GeminiProvider>(GeminiProvider);
    configService = module.get<ConfigService>(ConfigService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
    expect(provider.providerName).toBe('gemini');
  });

  it('should generate query embedding correctly', async () => {
    mockEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });

    const result = await provider.embedQuery('test query');

    expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
      model: 'gemini-embedding-001',
      input: 'test query',
      dimensions: 768,
    });
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('should generate batch embeddings correctly', async () => {
    mockEmbeddingsCreate.mockResolvedValue({
      data: [
        { embedding: [0.1, 0.2] },
        { embedding: [0.3, 0.4] },
      ],
    });

    const result = await provider.embedBatch(['text1', 'text2']);

    expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
      model: 'gemini-embedding-001',
      input: ['text1', 'text2'],
      dimensions: 768,
    });
    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });

  it('should stream chat completion and yield content chunks', async () => {
    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: 'Hello' } }] };
        yield { choices: [{ delta: { content: ' world' } }] };
        yield { usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } };
      },
    };
    mockCompletionsCreate.mockResolvedValue(mockStream);

    const result = await provider.streamCompletion('sys prompt', 'user message');

    expect(mockCompletionsCreate).toHaveBeenCalledWith({
      model: 'gemini-1.5-flash',
      messages: [
        { role: 'system', content: 'sys prompt' },
        { role: 'user', content: [{ type: 'text', text: 'user message' }] },
      ],
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.1,
      max_tokens: 1024,
    });

    const chunks: string[] = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hello', ' world']);
    const usage = await result.getUsage();
    expect(usage).toEqual({
      promptTokens: 5,
      completionTokens: 3,
      totalTokens: 8,
    });
  });
});
