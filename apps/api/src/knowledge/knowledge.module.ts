import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { IngestionProducer } from './ingestion/ingestion.producer';
import { ParseProcessor } from './ingestion/parse.processor';
import { ChunkProcessor } from './ingestion/chunk.processor';
import { EmbedProcessor } from './ingestion/embed.processor';
import { CrawlProcessor } from './ingestion/crawl.processor';
import { QdrantService } from './qdrant.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: 'parse' },
      { name: 'chunk' },
      { name: 'embed' },
      { name: 'crawl' },
    ),
  ],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    IngestionProducer,
    ParseProcessor,
    ChunkProcessor,
    EmbedProcessor,
    CrawlProcessor,
    QdrantService,
  ],
  exports: [KnowledgeService, QdrantService],
})
export class KnowledgeModule {}
