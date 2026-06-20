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
   * Reranker that filters and re-sorts chunks.
   * If COHERE_API_KEY is configured, uses Cohere's cross-encoder rerank-english-v3.0 model.
   * Otherwise falls back to cosine similarity score sorting.
   */
  async rerank(
    query: string,
    chunks: RetrievedChunk[],
    minScore: number = 0.3,
  ): Promise<RetrievedChunk[]> {
    const apiKey = this.configService.get<string>('COHERE_API_KEY');

    if (!apiKey || chunks.length === 0) {
      // Fallback to cosine score sorting
      return chunks
        .filter((chunk) => chunk.relevanceScore >= minScore)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 5); // Return top-5
    }

    try {
      this.logger.log(`Running Cohere Reranker for ${chunks.length} chunks`);
      const response = await fetch('https://api.cohere.ai/v1/rerank', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'rerank-english-v3.0',
          query,
          documents: chunks.map((c) => c.content),
          top_n: 5,
        }),
      });

      if (!response.ok) {
        throw new Error(`Cohere API returned status ${response.status}`);
      }

      const data = (await response.json()) as any;
      const results = data.results || [];

      const reranked: RetrievedChunk[] = results
        .map((res: any) => {
          const chunk = chunks[res.index];
          return {
            ...chunk,
            relevanceScore: res.relevance_score,
          };
        })
        .filter((chunk: RetrievedChunk) => chunk.relevanceScore >= minScore);

      return reranked;
    } catch (err) {
      this.logger.error(`Cohere Reranker failed: ${err}. Falling back to cosine sorting.`);
      return chunks
        .filter((chunk) => chunk.relevanceScore >= minScore)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 5);
    }
  }
}
