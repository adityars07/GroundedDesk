import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QdrantService } from '../qdrant.service';
import { EmbedJobData } from './ingestion.producer';
import { SourceStatus } from '@prisma/client';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

const EMBEDDING_BATCH_SIZE = 100;

@Processor('embed')
export class EmbedProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbedProcessor.name);
  private geminiClient: OpenAI;
  private embeddingModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly qdrantService: QdrantService,
    private readonly configService: ConfigService,
  ) {
    super();
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.geminiClient = new OpenAI({
      apiKey: apiKey || 'dummy-key',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
    this.embeddingModel = this.configService.get<string>(
      'GEMINI_EMBEDDING_MODEL',
      'gemini-embedding-001',
    );
  }

  async process(job: Job<EmbedJobData>): Promise<void> {
    const { sourceId, tenantId, chunks } = job.data;
    this.logger.log(`Embedding ${chunks.length} chunks for source ${sourceId}`);

    try {
      let totalTokens = 0;

      // Process chunks in batches
      for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);

        // Generate embeddings
        const response = await this.geminiClient.embeddings.create({
          model: this.embeddingModel,
          input: batch.map((c) => c.content),
          dimensions: this.configService.get<number>('VECTOR_SIZE', 768),
        } as any);

        totalTokens += response.usage?.total_tokens || 0;

        // Prepare Qdrant points and Prisma records
        const points: any[] = [];
        const chunkRecords: any[] = [];

        for (let j = 0; j < batch.length; j++) {
          const vectorId = uuidv4();
          const chunk = batch[j];
          const embedding = response.data[j].embedding;

          points.push({
            id: vectorId,
            vector: embedding,
            payload: {
              tenant_id: tenantId,
              source_id: sourceId,
              chunk_id: vectorId,
              content: chunk.content,
              metadata: chunk.metadata,
            },
          });

          chunkRecords.push({
            id: vectorId,
            sourceId,
            tenantId,
            content: chunk.content,
            tokenCount: Math.ceil(chunk.content.length / 4),
            metadata: chunk.metadata,
            vectorId,
          });
        }

        // Upsert to Qdrant
        await this.qdrantService.upsertVectors(points);

        // Save chunk records to Postgres
        await this.prisma.chunk.createMany({
          data: chunkRecords,
        });

        this.logger.log(
          `Embedded batch ${Math.floor(i / EMBEDDING_BATCH_SIZE) + 1}/${Math.ceil(chunks.length / EMBEDDING_BATCH_SIZE)}`,
        );
      }

      // Update source status and chunk count
      await this.prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: {
          status: SourceStatus.READY,
          chunkCount: chunks.length,
        },
      });

      // Log embedding cost
      const costPerToken = 0.00000005; // $0.05 per 1M tokens for text-embedding-004
      await this.prisma.costLog.create({
        data: {
          tenantId,
          model: this.embeddingModel,
          promptTokens: totalTokens,
          completionTokens: 0,
          totalCost: totalTokens * costPerToken,
          operation: 'embedding',
        },
      });

      this.logger.log(
        `Completed embedding for source ${sourceId}: ${chunks.length} chunks, ${totalTokens} tokens`,
      );
    } catch (error) {
      this.logger.error(`Failed to embed source ${sourceId}: ${error}`);

      await this.prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: {
          status: SourceStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Embedding failed',
        },
      });

      throw error;
    }
  }
}
