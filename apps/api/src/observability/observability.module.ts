import { Module, Global } from '@nestjs/common';
import { LangfuseService } from './langfuse.service';
import { CostTrackerService } from './cost-tracker.service';
import { ObservabilityController } from './observability.controller';

@Global()
@Module({
  providers: [LangfuseService, CostTrackerService],
  controllers: [ObservabilityController],
  exports: [LangfuseService, CostTrackerService],
})
export class ObservabilityModule {}
