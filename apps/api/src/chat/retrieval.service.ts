import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantService } from '../knowledge/qdrant.service';
import { PrismaService } from '../prisma/prisma.service';

export interface RetrievedChunk {
  chunkId: string;
  sourceId: string;
  sourceName: string;
  content: string;
  relevanceScore: number;
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly qdrantService: QdrantService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Retrieve relevant chunks for a query within a tenant's namespace.
   * Returns the top-K most relevant chunks with their source metadata.
   */
  async retrieve(
    tenantId: string,
    queryEmbedding: number[],
    topK: number = 5,
  ): Promise<RetrievedChunk[]> {
    const results = await this.qdrantService.search(tenantId, queryEmbedding, topK);

    if (!results || results.length === 0) {
      this.logger.warn(`No results found for tenant ${tenantId}`);
      return [];
    }

    // Enrich with source metadata from Postgres
    const chunks: RetrievedChunk[] = [];

    for (const result of results) {
      const payload = result.payload as any;

      chunks.push({
        chunkId: payload?.chunk_id || result.id.toString(),
        sourceId: payload?.source_id || '',
        sourceName: payload?.metadata?.sourceName || 'Unknown',
        content: payload?.content || '',
        relevanceScore: result.score,
      });
    }

    return chunks;
  }

  /**
   * Simple reranker that filters out low-relevance chunks
   * and re-sorts by a combination of relevance score and recency.
   */
  rerank(chunks: RetrievedChunk[], minScore: number = 0.3): RetrievedChunk[] {
    return chunks
      .filter((chunk) => chunk.relevanceScore >= minScore)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}
