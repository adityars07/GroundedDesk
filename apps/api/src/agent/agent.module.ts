import { Module, forwardRef } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';

// PrismaModule is @Global() — no import needed here

@Module({
  imports: [AuthModule, forwardRef(() => ChatModule)],
  providers: [AgentGateway],
  exports: [AgentGateway],
})
export class AgentModule {}
