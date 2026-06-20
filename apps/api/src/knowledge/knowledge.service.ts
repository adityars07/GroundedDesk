import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IngestionProducer } from './ingestion/ingestion.producer';
import { QdrantService } from './qdrant.service';
import { SourceType, SourceStatus } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs/promises';

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestionProducer: IngestionProducer,
    private readonly qdrantService: QdrantService,
  ) {}

  async uploadFile(tenantId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const typeMap: Record<string, SourceType> = {
      '.pdf': SourceType.PDF,
      '.docx': SourceType.DOCX,
      '.md': SourceType.MARKDOWN,
      '.markdown': SourceType.MARKDOWN,
    };

    const sourceType = typeMap[ext];
    if (!sourceType) {
      throw new BadRequestException(
        `Unsupported file type: ${ext}. Supported: .pdf, .docx, .md`,
      );
    }

    // Check for existing source with same name (not archived)
    const existing = await this.prisma.knowledgeSource.findFirst({
      where: {
        tenantId,
        name: file.originalname,
        status: { not: SourceStatus.ARCHIVED },
      },
      orderBy: { version: 'desc' },
    });

    let version = 1;
    let previousVersionId: string | null = null;

    if (existing) {
      version = existing.version + 1;
      previousVersionId = existing.id;

      // 1. Archive the old source
      await this.prisma.knowledgeSource.update({
        where: { id: existing.id },
        data: { status: SourceStatus.ARCHIVED },
      });

      // 2. Delete old Qdrant vectors
      const chunks = await this.prisma.chunk.findMany({
        where: { sourceId: existing.id, tenantId },
        select: { vectorId: true },
      });
      if (chunks.length > 0) {
        const vectorIds = chunks.map((c) => c.vectorId);
        await this.qdrantService.deleteVectors(vectorIds);
      }
    }

    // Save file to local storage
    const uploadDir = path.join(process.cwd(), 'uploads', tenantId);
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, `${Date.now()}-${file.originalname}`);
    await fs.writeFile(filePath, file.buffer);

    // Create knowledge source record
    const source = await this.prisma.knowledgeSource.create({
      data: {
        tenantId,
        type: sourceType,
        name: file.originalname,
        status: SourceStatus.PENDING,
        filePath,
        version,
        previousVersionId,
        metadata: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
        },
      },
    });

    // Queue ingestion job
    await this.ingestionProducer.queueParse({
      sourceId: source.id,
      tenantId,
      filePath,
      sourceType,
    });

    return source;
  }

  async crawlUrl(tenantId: string, url: string, name: string) {
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    const sourceName = name || url;

    // Check for existing source with same name or same url (not archived)
    const existing = await this.prisma.knowledgeSource.findFirst({
      where: {
        tenantId,
        OR: [
          { url },
          { name: sourceName },
        ],
        status: { not: SourceStatus.ARCHIVED },
      },
      orderBy: { version: 'desc' },
    });

    let version = 1;
    let previousVersionId: string | null = null;

    if (existing) {
      version = existing.version + 1;
      previousVersionId = existing.id;

      // 1. Archive the old source
      await this.prisma.knowledgeSource.update({
        where: { id: existing.id },
        data: { status: SourceStatus.ARCHIVED },
      });

      // 2. Delete old Qdrant vectors
      const chunks = await this.prisma.chunk.findMany({
        where: { sourceId: existing.id, tenantId },
        select: { vectorId: true },
      });
      if (chunks.length > 0) {
        const vectorIds = chunks.map((c) => c.vectorId);
        await this.qdrantService.deleteVectors(vectorIds);
      }
    }

    const source = await this.prisma.knowledgeSource.create({
      data: {
        tenantId,
        type: SourceType.URL,
        name: sourceName,
        status: SourceStatus.PENDING,
        url,
        version,
        previousVersionId,
        metadata: { url },
      },
    });

    await this.ingestionProducer.queueCrawl({
      sourceId: source.id,
      tenantId,
      url,
    });

    return source;
  }

  async listSources(tenantId: string, status?: string) {
    const where: any = { tenantId };
    if (status) {
      where.status = status as SourceStatus;
    } else {
      where.status = { not: SourceStatus.ARCHIVED };
    }

    return this.prisma.knowledgeSource.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSource(tenantId: string, id: string) {
    const source = await this.prisma.knowledgeSource.findFirst({
      where: { id, tenantId },
    });

    if (!source) {
      throw new NotFoundException(`Source ${id} not found`);
    }

    return source;
  }

  async getSourceChunks(
    tenantId: string,
    sourceId: string,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;

    const [chunks, total] = await Promise.all([
      this.prisma.chunk.findMany({
        where: { sourceId, tenantId },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.chunk.count({
        where: { sourceId, tenantId },
      }),
    ]);

    return {
      chunks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async deleteSource(tenantId: string, id: string) {
    const source = await this.prisma.knowledgeSource.findFirst({
      where: { id, tenantId },
    });

    if (!source) {
      throw new NotFoundException(`Source ${id} not found`);
    }

    // Delete vectors from Qdrant
    const chunks = await this.prisma.chunk.findMany({
      where: { sourceId: id, tenantId },
      select: { vectorId: true },
    });

    if (chunks.length > 0) {
      const vectorIds = chunks.map((c) => c.vectorId);
      await this.qdrantService.deleteVectors(vectorIds);
    }

    // Delete from database (cascades to chunks)
    await this.prisma.knowledgeSource.delete({
      where: { id },
    });

    // Delete file if exists
    if (source.filePath) {
      try {
        await fs.unlink(source.filePath);
      } catch {
        // File may already be deleted
      }
    }

    return { deleted: true };
  }

  async getSourceHistory(tenantId: string, id: string) {
    const source = await this.getSource(tenantId, id);

    const where: any = {
      tenantId,
    };
    if (source.type === SourceType.URL && source.url) {
      where.url = source.url;
    } else {
      where.name = source.name;
    }

    return this.prisma.knowledgeSource.findMany({
      where,
      orderBy: { version: 'desc' },
    });
  }
}
