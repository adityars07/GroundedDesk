import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('tenant')
@UseGuards(JwtAuthGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get(['me', 'current'])
  async getCurrent(@CurrentUser() user: any) {
    return this.tenantService.findById(user.tenantId);
  }

  @Get('current/stats')
  async getStats(@CurrentUser() user: any) {
    return this.tenantService.getStats(user.tenantId);
  }

  @Patch(['me', 'current/settings'])
  async updateSettings(
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    // Handle both { settings: {...} } and direct settings object
    const settings = body.settings || body;
    return this.tenantService.updateSettings(user.tenantId, settings);
  }
}
