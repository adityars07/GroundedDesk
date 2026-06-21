import { Module, forwardRef } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { RetrievalService } from './retrieval.service';
import { LlmService } from './llm.service';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AuthModule } from '../auth/auth.module';
import { GuardrailModule } from '../guardrail/guardrail.module';
import { AgentModule } from '../agent/agent.module';
import { BillingModule } from '../billing/billing.module';
import { ChatController } from './chat.controller';
import { CopilotService } from './copilot.service';
import { ToolExecutorService } from './tools/tool-executor.service';
import { MockCrmController } from './tools/mock-crm.controller';

@Module({
  imports: [KnowledgeModule, AuthModule, GuardrailModule, forwardRef(() => AgentModule), BillingModule],
  controllers: [ChatController, MockCrmController],
  providers: [
    // LLM providers (order matters: AnthropicProvider depends on OpenAIProvider)
    OpenAIProvider,
    AnthropicProvider,
    // Orchestrator and services
    LlmService,
    RetrievalService,
    ChatService,
    ChatGateway,
    CopilotService,
    ToolExecutorService,
  ],
  exports: [ChatService, RetrievalService, LlmService, CopilotService, ToolExecutorService],
})
export class ChatModule {}
