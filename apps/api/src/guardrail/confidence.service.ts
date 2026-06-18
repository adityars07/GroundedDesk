import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConfidenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Determine if the response is low confidence based on the tenant's threshold setting.
   */
  async isLowConfidence(tenantId: string, confidenceScore: number): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    const settings = tenant?.settings as any;
    const threshold = settings?.confidenceThreshold !== undefined ? parseFloat(settings.confidenceThreshold) : 0.6;

    return confidenceScore < threshold;
  }
}
