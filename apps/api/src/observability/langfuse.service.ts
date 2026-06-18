import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Langfuse } from 'langfuse';

@Injectable()
export class LangfuseService implements OnModuleDestroy {
  private readonly logger = new Logger(LangfuseService.name);
  private langfuse?: Langfuse;

  constructor(private readonly configService: ConfigService) {
    const publicKey = this.configService.get<string>('LANGFUSE_PUBLIC_KEY');
    const secretKey = this.configService.get<string>('LANGFUSE_SECRET_KEY');
    const baseUrl = this.configService.get<string>('LANGFUSE_HOST', 'https://cloud.langfuse.com');

    if (publicKey && secretKey) {
      this.langfuse = new Langfuse({
        publicKey,
        secretKey,
        baseUrl,
      });
      this.logger.log('Langfuse observability initialized');
    } else {
      this.logger.warn('Langfuse public or secret keys are missing. Tracing will be disabled.');
    }
  }

  async onModuleDestroy() {
    if (this.langfuse) {
      await this.langfuse.shutdownAsync();
    }
  }

  /**
   * Get raw Langfuse instance.
   */
  getClient() {
    return this.langfuse;
  }

  /**
   * Create a trace for a RAG execution.
   */
  createTrace(options: {
    name: string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
    tags?: string[];
  }) {
    if (!this.langfuse) return null;

    return this.langfuse.trace({
      name: options.name,
      userId: options.userId,
      sessionId: options.sessionId,
      metadata: options.metadata,
      tags: options.tags,
    });
  }
}
