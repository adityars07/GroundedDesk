import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationStatus } from '@prisma/client';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);

  constructor(private readonly prisma: PrismaService) {}

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'track_order',
        description: 'Track a customer order status, shipping carrier, and estimated delivery date using the order ID.',
        parameters: {
          type: 'object',
          properties: {
            orderId: {
              type: 'string',
              description: 'The unique alphanumeric order ID, e.g. ACME-12345',
            },
          },
          required: ['orderId'],
        },
      },
      {
        name: 'escalate_to_human',
        description: 'Escalate the current conversation to a live human support agent immediately.',
        parameters: {
          type: 'object',
          properties: {
            reason: {
              type: 'string',
              description: 'The reason for escalation, e.g. customer request or complex billing dispute',
            },
          },
          required: ['reason'],
        },
      },
      {
        name: 'update_customer_crm',
        description: 'Update customer details (name, phone) in the CRM system using their email.',
        parameters: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              description: 'The customer email address',
            },
            name: {
              type: 'string',
              description: 'The customer name',
            },
            phone: {
              type: 'string',
              description: 'The customer phone number',
            },
          },
          required: ['email'],
        },
      },
    ];
  }

  async executeTool(
    name: string,
    args: any,
    tenantId: string,
    conversationId?: string,
  ): Promise<any> {
    this.logger.log(`Executing tool "${name}" with args: ${JSON.stringify(args)} for tenant ${tenantId}`);

    switch (name) {
      case 'track_order':
        return this.trackOrder(args.orderId);
      case 'escalate_to_human':
        if (!conversationId) return { error: 'Conversation ID required for escalation' };
        return this.escalateToHuman(conversationId, tenantId, args.reason);
      case 'update_customer_crm':
        return this.updateCustomerCrm(tenantId, args.email, args.name, args.phone);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // --- Mock Tool Implementations ---

  private async trackOrder(orderId: string): Promise<any> {
    // Simulated order database lookup
    const orderNum = orderId.replace(/[^0-9]/g, '');
    const exists = orderNum.length > 0;

    if (!exists) {
      return { status: 'ERROR', message: `Order ${orderId} not found in our database.` };
    }

    const statuses = ['PROCESSING', 'SHIPPED', 'DELIVERED', 'IN_TRANSIT'];
    const status = statuses[parseInt(orderNum) % statuses.length];
    
    return {
      orderId,
      status,
      carrier: 'FedEx',
      trackingNumber: `1Z999AA1012345678${orderNum}`,
      estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toDateString(),
      itemsCount: (parseInt(orderNum) % 3) + 1,
    };
  }

  private async escalateToHuman(
    conversationId: string,
    tenantId: string,
    reason: string,
  ): Promise<any> {
    try {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          status: ConversationStatus.ESCALATED,
        },
      });

      // Save a system log message about the escalation
      await this.prisma.message.create({
        data: {
          conversationId,
          tenantId,
          role: 'SYSTEM',
          content: `Conversation escalated to human agent. Reason: ${reason}`,
        },
      });

      return {
        status: 'SUCCESS',
        message: 'The conversation has been escalated. A human agent has been notified and will join shortly.',
      };
    } catch (err) {
      return { status: 'ERROR', message: 'Failed to escalate conversation: ' + (err as Error).message };
    }
  }

  private async updateCustomerCrm(
    tenantId: string,
    email: string,
    name?: string,
    phone?: string,
  ): Promise<any> {
    try {
      // Find user under this tenant
      let user = await this.prisma.user.findFirst({
        where: { email, tenantId },
      });

      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            name: name || user.name,
          },
        });
      }

      return {
        status: 'SUCCESS',
        message: `CRM records updated for customer ${email}.`,
        user: { email, name, phone },
      };
    } catch (err) {
      return { status: 'ERROR', message: 'CRM update failed: ' + (err as Error).message };
    }
  }
}
