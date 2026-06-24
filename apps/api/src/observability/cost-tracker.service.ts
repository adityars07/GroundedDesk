import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CostTrackerService {
  private readonly logger = new Logger(CostTrackerService.name);

  // Model cost definitions (cost per 1M tokens)
  private readonly modelPricing: Record<string, { prompt: number; completion: number }> = {
    'gemini-1.5-flash': { prompt: 0.075, completion: 0.3 },
    'text-embedding-004': { prompt: 0.05, completion: 0 },
    'gemini-embedding-001': { prompt: 0.025, completion: 0 },
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log LLM operation tokens and calculate cost.
   */
  async logCost(options: {
    tenantId: string;
    conversationId?: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    operation?: string;
  }): Promise<number> {
    const pricing = this.modelPricing[options.model] || { prompt: 0, completion: 0 };
    const promptCost = (options.promptTokens / 1_000_000) * pricing.prompt;
    const completionCost = (options.completionTokens / 1_000_000) * pricing.completion;
    const totalCost = promptCost + completionCost;

    try {
      await this.prisma.costLog.create({
        data: {
          tenantId: options.tenantId,
          conversationId: options.conversationId,
          model: options.model,
          promptTokens: options.promptTokens,
          completionTokens: options.completionTokens,
          totalCost,
          operation: options.operation || 'chat',
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log cost to database: ${error}`);
    }

    return totalCost;
  }

  /**
   * Retrieve total spend for a tenant, optionally filtered by operation.
   */
  async getTotalSpend(tenantId: string, operation?: string): Promise<number> {
    const aggregate = await this.prisma.costLog.aggregate({
      where: {
        tenantId,
        ...(operation ? { operation } : {}),
      },
      _sum: {
        totalCost: true,
      },
    });

    return aggregate._sum.totalCost || 0;
  }

  /**
   * Get cost history grouped by day for the last N days.
   */
  async getDailySpendHistory(tenantId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await this.prisma.costLog.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: startDate,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group in JS since Prisma doesn't support easy GROUP BY with dates without raw query
    const dailyMap: Record<string, number> = {};
    for (const log of logs) {
      const dateStr = log.createdAt.toISOString().split('T')[0];
      dailyMap[dateStr] = (dailyMap[dateStr] || 0) + log.totalCost;
    }

    return Object.entries(dailyMap).map(([date, spend]) => ({
      date,
      spend,
    }));
  }
}
