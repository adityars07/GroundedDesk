import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SourceType } from '@prisma/client';

export interface ParseJobData {
  sourceId: string;
  tenantId: string;
  filePath: string;
  sourceType: SourceType;
}

export interface ChunkJobData {
  sourceId: string;
  tenantId: string;
  rawText: string;
  sourceName: string;
  sourceType: SourceType;
}

export interface EmbedJobData {
  sourceId: string;
  tenantId: string;
  chunks: Array<{
    content: string;
    metadata: Record<string, any>;
  }>;
}

export interface CrawlJobData {
  sourceId: string;
  tenantId: string;
  url: string;
}

@Injectable()
export class IngestionProducer {
  constructor(
    @InjectQueue('parse') private parseQueue: Queue,
    @InjectQueue('chunk') private chunkQueue: Queue,
    @InjectQueue('embed') private embedQueue: Queue,
    @InjectQueue('crawl') private crawlQueue: Queue,
  ) {}

  async queueParse(data: ParseJobData) {
    return this.parseQueue.add('parse-document', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });
  }

  async queueChunk(data: ChunkJobData) {
    return this.chunkQueue.add('chunk-text', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
    });
  }

  async queueEmbed(data: EmbedJobData) {
    return this.embedQueue.add('embed-chunks', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });
  }

  async queueCrawl(data: CrawlJobData) {
    return this.crawlQueue.add('crawl-url', data, {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
    });
  }
}
