import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAwarePrismaService } from '../prisma/tenant-aware-prisma.service';

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantAwarePrismaService,
  ) {}

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with slug "${slug}" not found`);
    }
    return tenant;
  }

  async updateSettings(tenantId: string, settings: Record<string, any>) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: settings,
      },
    });
  }

  async getStats(tenantId: string) {
    const [sourceCount, chunkCount, conversationCount, messageCount] = await Promise.all([
      this.prisma.knowledgeSource.count({ where: { tenantId } }),
      this.prisma.chunk.count({ where: { tenantId } }),
      this.prisma.conversation.count({ where: { tenantId } }),
      this.prisma.message.count({ where: { tenantId } }),
    ]);

    return {
      sources: sourceCount,
      chunks: chunkCount,
      conversations: conversationCount,
      messages: messageCount,
    };
  }
}
