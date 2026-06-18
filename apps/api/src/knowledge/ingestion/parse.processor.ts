import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { IngestionProducer, ParseJobData } from './ingestion.producer';
import { SourceStatus, SourceType } from '@prisma/client';
import * as fs from 'fs/promises';
import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { marked } from 'marked';

@Processor('parse')
export class ParseProcessor extends WorkerHost {
  private readonly logger = new Logger(ParseProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestionProducer: IngestionProducer,
  ) {
    super();
  }

  async process(job: Job<ParseJobData>): Promise<void> {
    const { sourceId, tenantId, filePath, sourceType } = job.data;
    this.logger.log(`Parsing source ${sourceId} (${sourceType})`);

    try {
      // Update status to PROCESSING
      await this.prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: { status: SourceStatus.PROCESSING },
      });

      // Parse based on file type
      let rawText: string;

      switch (sourceType) {
        case SourceType.PDF:
          rawText = await this.parsePdf(filePath);
          break;
        case SourceType.DOCX:
          rawText = await this.parseDocx(filePath);
          break;
        case SourceType.MARKDOWN:
          rawText = await this.parseMarkdown(filePath);
          break;
        default:
          throw new Error(`Unsupported source type: ${sourceType}`);
      }

      if (!rawText || rawText.trim().length === 0) {
        throw new Error('Extracted text is empty');
      }

      this.logger.log(`Parsed ${rawText.length} characters from ${sourceId}`);

      // Get source name for metadata
      const source = await this.prisma.knowledgeSource.findUnique({
        where: { id: sourceId },
      });

      // Queue chunking job
      await this.ingestionProducer.queueChunk({
        sourceId,
        tenantId,
        rawText,
        sourceName: source?.name || 'Unknown',
        sourceType,
      });
    } catch (error) {
      this.logger.error(`Failed to parse source ${sourceId}: ${error}`);

      await this.prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: {
          status: SourceStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }

  private async parsePdf(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  private async parseDocx(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  private async parseMarkdown(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8');
    // Strip markdown to plain text
    const html = await marked(content);
    // Remove HTML tags to get plain text
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
