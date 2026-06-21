import { Controller, Get, Post, Param, Body, NotFoundException } from '@nestjs/common';

@Controller('tools/mock-crm')
export class MockCrmController {
  @Get('orders/:orderId')
  async getOrderDetails(@Param('orderId') orderId: string) {
    const orderNum = orderId.replace(/[^0-9]/g, '');
    if (orderNum.length === 0) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const statuses = ['PROCESSING', 'SHIPPED', 'DELIVERED', 'IN_TRANSIT'];
    const status = statuses[parseInt(orderNum) % statuses.length];

    return {
      orderId,
      status,
      carrier: 'FedEx',
      trackingNumber: `1Z999AA1012345678${orderNum}`,
      estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      items: [
        { name: 'Acme Coffee Blend - 1lb Bag', quantity: 2, price: 14.99 },
        { name: 'Acme Premium French Press', quantity: 1, price: 34.99 },
      ],
    };
  }

  @Post('customer')
  async updateCustomerInfo(
    @Body('email') email: string,
    @Body('name') name?: string,
    @Body('phone') phone?: string,
  ) {
    return {
      success: true,
      message: `Updated records for customer: ${email}`,
      customer: { email, name, phone, lastUpdated: new Date().toISOString() },
    };
  }
}
