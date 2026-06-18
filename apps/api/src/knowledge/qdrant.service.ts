import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

const COLLECTION_NAME = 'groundeddesk_chunks';
const VECTOR_SIZE = 1536; // text-embedding-3-small dimensions

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private client: QdrantClient;

  constructor(private readonly configService: ConfigService) {
    this.client = new QdrantClient({
      host: this.configService.get<string>('QDRANT_HOST', 'localhost'),
      port: this.configService.get<number>('QDRANT_PORT', 6333),
    });
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
      const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);

      if (!exists) {
        await this.client.createCollection(COLLECTION_NAME, {
          vectors: {
            size: VECTOR_SIZE,
            distance: 'Cosine',
          },
        });

        // Create payload index on tenant_id for fast filtering
        await this.client.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'tenant_id',
          field_schema: 'keyword',
          is_tenant: true,
        });

        // Create payload index on source_id for deletion
        await this.client.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'source_id',
          field_schema: 'keyword',
        });

        this.logger.log(`Created Qdrant collection: ${COLLECTION_NAME}`);
      } else {
        this.logger.log(`Qdrant collection already exists: ${COLLECTION_NAME}`);
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
    await this.client.upsert(COLLECTION_NAME, {
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
    return this.client.search(COLLECTION_NAME, {
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
    await this.client.delete(COLLECTION_NAME, {
      wait: true,
      points: ids,
    });
  }

  /**
   * Delete all vectors for a specific source.
   */
  async deleteBySource(sourceId: string) {
    await this.client.delete(COLLECTION_NAME, {
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
