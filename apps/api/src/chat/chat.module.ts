import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { RetrievalService } from './retrieval.service';
import { LlmService } from './llm.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AuthModule } from '../auth/auth.module';
import { GuardrailModule } from '../guardrail/guardrail.module';

@Module({
  imports: [KnowledgeModule, AuthModule, GuardrailModule],
  providers: [ChatGateway, ChatService, RetrievalService, LlmService],
  exports: [ChatService, RetrievalService, LlmService],
})
export class ChatModule {}
