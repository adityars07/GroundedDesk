import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('current')
  async getCurrent(@CurrentUser() user: any) {
    return this.tenantService.findById(user.tenantId);
  }

  @Get('current/stats')
  async getStats(@CurrentUser() user: any) {
    return this.tenantService.getStats(user.tenantId);
  }

  @Patch('current/settings')
  async updateSettings(
    @CurrentUser() user: any,
    @Body() settings: Record<string, any>,
  ) {
    return this.tenantService.updateSettings(user.tenantId, settings);
  }
}
