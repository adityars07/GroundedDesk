import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private client: QdrantClient;
  private readonly collectionName: string;
  private readonly vectorSize: number;

  constructor(private readonly configService: ConfigService) {
    this.client = new QdrantClient({
      host: this.configService.get<string>('QDRANT_HOST', 'localhost'),
      port: this.configService.get<number>('QDRANT_PORT', 6333),
    });
    this.vectorSize = Number(this.configService.get('VECTOR_SIZE', 1536));
    this.collectionName = `groundeddesk_chunks_${this.vectorSize}`;
  }

  async onModuleInit() {
    await this.ensureCollection();
  }

  /**
   * Ensure the collection exists with the correct schema.
   * Uses payload-based tenant isolation with indexed tenant_id.
   */
  private async ensureCollection() {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some((c) => c.name === this.collectionName);

      if (!exists) {
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine',
          },
        });

        // Create payload index on tenant_id for fast filtering
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'tenant_id',
          field_schema: {
            type: 'keyword',
            is_tenant: true,
          } as any,
        });

        // Create payload index on source_id for deletion
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'source_id',
          field_schema: 'keyword',
        });

        this.logger.log(`Created Qdrant collection: ${this.collectionName}`);
      } else {
        this.logger.log(`Qdrant collection already exists: ${this.collectionName}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to initialize Qdrant collection: ${error}`);
      // Don't crash the app — Qdrant may not be available in all environments
    }
  }

  /**
   * Upsert vectors with tenant-scoped payloads.
   */
  async upsertVectors(
    points: Array<{
      id: string;
      vector: number[];
      payload: {
        tenant_id: string;
        source_id: string;
        chunk_id: string;
        content: string;
        metadata: Record<string, any>;
      };
    }>,
  ) {
    await this.client.upsert(this.collectionName, {
      wait: true,
      points,
    });
  }

  /**
   * Search for similar vectors within a tenant's namespace.
   */
  async search(
    tenantId: string,
    vector: number[],
    limit: number = 5,
  ) {
    return this.client.search(this.collectionName, {
      vector,
      limit,
      filter: {
        must: [
          {
            key: 'tenant_id',
            match: { value: tenantId },
          },
        ],
      },
      with_payload: true,
    });
  }

  /**
   * Delete vectors by their IDs.
   */
  async deleteVectors(ids: string[]) {
    await this.client.delete(this.collectionName, {
      wait: true,
      points: ids,
    });
  }

  /**
   * Delete all vectors for a specific source.
   */
  async deleteBySource(sourceId: string) {
    await this.client.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [
          {
            key: 'source_id',
            match: { value: sourceId },
          },
        ],
      },
    });
  }
}
