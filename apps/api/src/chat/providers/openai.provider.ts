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
 * OpenAI LLM provider.
 * Handles both chat completions (GPT-4o) and embeddings
 * (text-embedding-3-small).  All other providers delegate
 * embed calls back to this one to keep vector-space consistency.
 */
@Injectable()
export class OpenAIProvider implements ILlmProvider {
  readonly providerName = 'openai';
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly client: OpenAI;
  private readonly chatModel: string;
  private readonly embeddingModel: string;

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
    this.chatModel = this.configService.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o');
    this.embeddingModel = this.configService.get<string>(
      'OPENAI_EMBEDDING_MODEL',
      'text-embedding-3-small',
    );
  }

  async embedQuery(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });
    return response.data[0].embedding;
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
