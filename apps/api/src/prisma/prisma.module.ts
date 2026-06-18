import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantAwarePrismaService } from './tenant-aware-prisma.service';

@Global()
@Module({
  providers: [PrismaService, TenantAwarePrismaService],
  exports: [PrismaService, TenantAwarePrismaService],
})
export class PrismaModule {}
