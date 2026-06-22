import { Module, Global, forwardRef } from '@nestjs/common';
import { LangfuseService } from './langfuse.service';
import { CostTrackerService } from './cost-tracker.service';
import { ObservabilityController } from './observability.controller';
import { GapAnalyzerService } from './gap-analyzer.service';
import { ChatModule } from '../chat/chat.module';

@Global()
@Module({
  imports: [forwardRef(() => ChatModule)],
  providers: [LangfuseService, CostTrackerService, GapAnalyzerService],
  controllers: [ObservabilityController],
  exports: [LangfuseService, CostTrackerService, GapAnalyzerService],
})
export class ObservabilityModule {}
