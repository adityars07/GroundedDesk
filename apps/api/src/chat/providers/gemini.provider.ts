import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  ILlmProvider,
  LlmStreamResult,
  ConversationTurn,
  StreamCompletionOptions,
  LlmToolCall,
} from './llm-provider.interface';
import { getAttachmentBase64 } from '../../common/utils/attachment';

/**
 * Gemini LLM provider using Google's OpenAI-compatible endpoint.
 * Handles both chat completions (gemini-1.5-flash) and embeddings (text-embedding-004).
 */
@Injectable()
export class GeminiProvider implements ILlmProvider {
  readonly providerName = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client: OpenAI;
  private readonly chatModel: string;
  private readonly embeddingModel: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.client = new OpenAI({
      apiKey: apiKey || 'dummy-key',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
    this.chatModel = this.configService.get<string>('GEMINI_CHAT_MODEL', 'gemini-1.5-flash');
    this.embeddingModel = this.configService.get<string>(
      'GEMINI_EMBEDDING_MODEL',
      'text-embedding-004',
    );
  }

  async embedQuery(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
    });
    return response.data.map((d) => d.embedding);
  }

  async streamCompletion(
    systemPrompt: string,
    userMessage: string,
    history: ConversationTurn[] = [],
    options: StreamCompletionOptions = {},
  ): Promise<LlmStreamResult> {
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: 'text', text: userMessage }
    ];

    if (options.attachments && options.attachments.length > 0) {
      for (const att of options.attachments) {
        if (att.mimeType.startsWith('image/')) {
          const base64 = await getAttachmentBase64(att.url);
          if (base64) {
            userContent.push({
              type: 'image_url',
              image_url: {
                url: `data:${base64.mimeType};base64,${base64.data}`,
              },
            });
          }
        }
      }
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: userContent },
    ];

    const requestParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model: this.chatModel,
      messages,
      stream: true as const,
      stream_options: { include_usage: true },
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 1024,
    };

    if (options.tools && options.tools.length > 0) {
      requestParams.tools = options.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const oaiStream = await this.client.chat.completions.create(requestParams);

    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const accumulatedToolCalls: any[] = [];
    const finalToolCalls: LlmToolCall[] = [];

    const textStream = async function* () {
      for await (const chunk of oaiStream) {
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          yield delta.content;
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index;
            if (!accumulatedToolCalls[index]) {
              accumulatedToolCalls[index] = {
                id: tc.id || '',
                name: tc.function?.name || '',
                arguments: '',
              };
            }
            if (tc.id) accumulatedToolCalls[index].id = tc.id;
            if (tc.function?.name) accumulatedToolCalls[index].name = tc.function.name;
            if (tc.function?.arguments) {
              accumulatedToolCalls[index].arguments += tc.function.arguments;
            }
          }
        }

        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }
      }

      // Populate final tool calls after the stream completes
      for (const tc of accumulatedToolCalls) {
        if (tc) {
          finalToolCalls.push({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          });
        }
      }
    };

    const modelName = this.chatModel;
    return {
      stream: textStream(),
      getUsage: async () => usage,
      providerName: this.providerName,
      modelName,
      toolCalls: finalToolCalls,
    };
  }
}
