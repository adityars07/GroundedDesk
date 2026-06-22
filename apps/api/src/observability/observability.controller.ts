import { Controller, Get, Post, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantAwarePrismaService } from '../prisma/tenant-aware-prisma.service';
import { CostTrackerService } from './cost-tracker.service';
import { GapAnalyzerService } from './gap-analyzer.service';

@Controller('observability')
@UseGuards(JwtAuthGuard)
export class ObservabilityController {
  constructor(
    private readonly tenantAwarePrisma: TenantAwarePrismaService,
    private readonly costTracker: CostTrackerService,
    private readonly gapAnalyzer: GapAnalyzerService,
  ) {}

  /**
   * Get overall stats for the dashboard:
   * - Total conversations
   * - Total messages
   * - Total cost (spend)
   * - Average response latency
   */
  @Get('stats')
  async getStats(@CurrentUser() user: any) {
    return this.tenantAwarePrisma.withTenantScope(async (prisma) => {
      // Since it's withTenantScope, PostgreSQL RLS will filter everything by tenant_id!
      const totalConversations = await prisma.conversation.count();
      const totalMessages = await prisma.message.count();

      const totalSpend = await this.costTracker.getTotalSpend(user.tenantId);

      // Average latency of assistant messages
      const latencyAggregate = await prisma.message.aggregate({
        where: {
          role: 'ASSISTANT',
          latencyMs: { not: null },
        },
        _avg: {
          latencyMs: true,
        },
      });

      return {
        totalConversations,
        totalMessages,
        totalSpend,
        avgLatencyMs: Math.round(latencyAggregate._avg.latencyMs || 0),
      };
    });
  }

  /**
   * Get spend history grouped by day for charts.
   */
  @Get('spend-history')
  async getSpendHistory(
    @CurrentUser() user: any,
    @Query('days') days?: string,
  ) {
    const numDays = days ? parseInt(days, 10) : 30;
    return this.costTracker.getDailySpendHistory(user.tenantId, numDays);
  }

  /**
   * Get latency distribution (p50, p95, p99 percentiles).
   */
  @Get('latency-percentiles')
  async getLatencyPercentiles() {
    return this.tenantAwarePrisma.withTenantScope(async (prisma) => {
      const messages = await prisma.message.findMany({
        where: {
          role: 'ASSISTANT',
          latencyMs: { not: null },
        },
        select: {
          latencyMs: true,
        },
        orderBy: {
          latencyMs: 'asc',
        },
      });

      if (messages.length === 0) {
        return { p50: 0, p95: 0, p99: 0 };
      }

      const latencies = messages.map((m) => m.latencyMs as number);
      const getPercentile = (p: number) => {
        const index = Math.ceil((p / 100) * latencies.length) - 1;
        return latencies[Math.max(0, index)];
      };

      return {
        p50: getPercentile(50),
        p95: getPercentile(95),
        p99: getPercentile(99),
      };
    });
  }

  /**
   * Get all clustered knowledge gaps for this tenant.
   */
  @Get('gaps')
  async getGaps(@CurrentUser() user: any) {
    const tenant = await this.tenantAwarePrisma.withTenantScope(async (prisma) => {
      return prisma.tenant.findUnique({
        where: { id: user.tenantId },
      });
    });

    const settings = (tenant?.settings as any) || {};
    if (settings.knowledgeGaps && settings.knowledgeGaps.length > 0) {
      return settings.knowledgeGaps;
    }

    // Force run an initial analysis if none exist
    return this.gapAnalyzer.analyzeGaps(user.tenantId);
  }

  /**
   * Force a fresh gap analysis and update the cached list.
   */
  @Post('gaps/analyze')
  async triggerAnalysis(@CurrentUser() user: any) {
    return this.gapAnalyzer.analyzeGaps(user.tenantId);
  }
}
