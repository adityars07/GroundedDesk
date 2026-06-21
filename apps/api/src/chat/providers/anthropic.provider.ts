import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  ILlmProvider,
  LlmStreamResult,
  ConversationTurn,
  StreamCompletionOptions,
} from './llm-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { getAttachmentBase64 } from '../../common/utils/attachment';

/**
 * Anthropic (Claude) LLM provider.
 *
 * Uses Claude 3.5 Sonnet for chat completions.
 * Embeddings are always delegated to OpenAIProvider so all tenants
 * share the same vector space (Qdrant collection uses OpenAI 1536-dim vectors).
 */
@Injectable()
export class AnthropicProvider implements ILlmProvider {
  readonly providerName = 'anthropic';
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly openaiProvider: OpenAIProvider,
  ) {
    this.client = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
    this.model = this.configService.get<string>('ANTHROPIC_CHAT_MODEL', 'claude-3-5-sonnet-20241022');
  }

  /** Delegate to OpenAI so embeddings remain in the same 1536-dim vector space. */
  async embedQuery(text: string): Promise<number[]> {
    return this.openaiProvider.embedQuery(text);
  }

  async streamCompletion(
    systemPrompt: string,
    userMessage: string,
    history: ConversationTurn[] = [],
    options: StreamCompletionOptions = {},
  ): Promise<LlmStreamResult> {
    const userContent: Anthropic.ContentBlockParam[] = [
      { type: 'text', text: userMessage }
    ];

    if (options.attachments && options.attachments.length > 0) {
      for (const att of options.attachments) {
        if (att.mimeType.startsWith('image/')) {
          const base64 = await getAttachmentBase64(att.url);
          if (base64) {
            userContent.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: base64.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: base64.data,
              },
            });
          }
        }
      }
    }

    const messages: Anthropic.MessageParam[] = [
      ...history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: userContent },
    ];

    const anthropicStream = this.client.messages.stream({
      model: this.model,
      system: systemPrompt,
      messages,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.1,
    });

    let inputTokens = 0;
    let outputTokens = 0;

    const textStream = async function* () {
      for await (const event of anthropicStream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
        if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens;
        }
        if (event.type === 'message_start' && event.message.usage) {
          inputTokens = event.message.usage.input_tokens;
        }
      }
    };

    const modelName = this.model;
    return {
      stream: textStream(),
      getUsage: async () => ({
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      }),
      providerName: this.providerName,
      modelName,
    };
  }
}
