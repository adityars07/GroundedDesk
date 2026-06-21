import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { AuthService } from '../auth/auth.service';
import { TenantAwarePrismaService } from '../prisma/tenant-aware-prisma.service';
import { ConfidenceService } from '../guardrail/confidence.service';
import { AgentGateway } from '../agent/agent.gateway';
import { ConversationStatus } from '@prisma/client';

interface AuthenticatedSocket extends Socket {
  tenantId?: string;
  sessionId?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*', // Configured properly in production
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly authService: AuthService,
    private readonly tenantAwarePrisma: TenantAwarePrismaService,
    private readonly confidenceService: ConfidenceService,
    private readonly agentGateway: AgentGateway,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const apiKey =
        client.handshake.auth?.apiKey ||
        client.handshake.query?.apiKey;

      if (!apiKey) {
        this.logger.warn(`Client ${client.id} connected without API key`);
        client.emit('error', { code: 'AUTH_REQUIRED', message: 'API key is required' });
        client.disconnect();
        return;
      }

      // Validate API key and resolve tenant
      const tenant = await this.authService.validateApiKey(apiKey as string);

      // ── Per-tenant CORS origin pinning (Phase 16) ─────────────────────
      const settings = (tenant.settings as any) || {};
      const allowedOrigins: string[] = settings.allowedOrigins || [];
      if (allowedOrigins.length > 0) {
        const origin = client.handshake.headers.origin || '';
        if (!allowedOrigins.includes(origin)) {
          this.logger.warn(
            `CORS_REJECTED: origin "${origin}" not in allowedOrigins for tenant ${tenant.slug}`,
          );
          client.emit('error', { code: 'CORS_REJECTED', message: 'Origin not allowed' });
          client.disconnect();
          return;
        }
      }

      client.tenantId = tenant.id;
      client.sessionId = client.handshake.auth?.sessionId || client.id;

      // Join the conversation room for agent fan-out
      this.logger.log(`Client ${client.id} connected to tenant ${tenant.slug}`);

      client.emit('connected', {
        tenantId: tenant.id,
        tenantName: tenant.name,
        settings: tenant.settings,
      });
    } catch (error) {
      this.logger.warn(`Client ${client.id} auth failed: ${error}`);
      client.emit('error', { code: 'AUTH_FAILED', message: 'Invalid API key' });
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() data: { text: string; conversationId?: string; attachments?: Array<{ name: string; url: string; mimeType: string }> },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.tenantId) {
      throw new WsException('Not authenticated');
    }

    if (!data?.text?.trim()) {
      client.emit('error', { code: 'EMPTY_MESSAGE', message: 'Message cannot be empty' });
      return;
    }

    this.logger.log(
      `Message from ${client.id}: "${data.text.substring(0, 50)}..."`,
    );

    try {
      const result = await this.chatService.processMessage(
        client.tenantId,
        client.sessionId!,
        data.text,
        data.conversationId,
        {
          userAgent: client.handshake.headers['user-agent'],
          ip: client.handshake.address,
        },
        data.attachments,
      );

      // Emit conversation ID immediately
      client.emit('conversation', { conversationId: result.conversationId });

      // Stream tokens to the client
      let tokenIndex = 0;
      for await (const token of result.stream) {
        client.emit('token', { text: token, index: tokenIndex++ });
      }

      // After stream completes, emit final metadata
      const completion = await result.onComplete();

      client.emit('done', {
        messageId: result.messageId,
        conversationId: result.conversationId,
        citations: completion.citations.map((c) => ({
          chunkId: c.chunkId,
          sourceId: c.sourceId,
          sourceName: c.sourceName,
          content: c.content.substring(0, 200),
          relevanceScore: c.relevanceScore,
        })),
        confidence: completion.confidence,
        latencyMs: completion.latencyMs,
      });

      // If confidence is below threshold, suggest human handoff
      const isLow = await this.confidenceService.isLowConfidence(client.tenantId, completion.confidence);
      if (isLow) {
        client.emit('low-confidence', {
          message: 'I may not have the best answer for this. Would you like to speak with a human agent?',
          confidence: completion.confidence,
        });
      }

      // Fan out customer message to any agent watching this conversation
      this.agentGateway.broadcastCustomerMessage(result.conversationId, data.text);
    } catch (error: any) {
      if (error instanceof Error && error.message === 'PROMPT_INJECTION_DETECTED') {
        client.emit('error', {
          code: 'PROMPT_INJECTION',
          message: 'Message blocked by security policies.',
        });
        return;
      }
      this.logger.error(`Chat error for ${client.id}: ${error}`);
      client.emit('error', {
        code: 'CHAT_ERROR',
        message: 'An error occurred while processing your message',
      });
    }
  }

  @SubscribeMessage('feedback')
  async handleFeedback(
    @MessageBody() data: { conversationId: string; rating: number },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.tenantId) return;

    try {
      await this.tenantAwarePrisma.withExplicitTenant(client.tenantId, async (prisma) => {
        await prisma.conversation.updateMany({
          where: {
            id: data.conversationId,
            tenantId: client.tenantId,
          },
          data: { rating: data.rating },
        });
      });

      client.emit('feedback-received', { success: true });
    } catch (error) {
      this.logger.error(`Feedback error: ${error}`);
    }
  }

  /**
   * Widget escalates the conversation to a human agent.
   * Marks the conversation ESCALATED so the agent dashboard shows it.
   */
  @SubscribeMessage('escalate')
  async handleEscalate(
    @MessageBody() data: { conversationId: string; reason?: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.tenantId) throw new WsException('Not authenticated');

    try {
      await this.tenantAwarePrisma.withExplicitTenant(client.tenantId, async (prisma) => {
        await prisma.conversation.update({
          where: { id: data.conversationId },
          data: { status: ConversationStatus.ESCALATED },
        });
      });

      client.emit('escalated', {
        conversationId: data.conversationId,
        message: 'A human agent has been notified. Please hold on.',
      });

      this.logger.log(
        `Conversation ${data.conversationId} escalated (reason: ${data.reason ?? 'user request'})`,
      );
    } catch (error) {
      this.logger.error(`Escalation error: ${error}`);
    }
  }
}
