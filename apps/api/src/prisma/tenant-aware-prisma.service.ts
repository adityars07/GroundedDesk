import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Tenant context stored in AsyncLocalStorage.
 * Set by TenantMiddleware for every incoming request.
 */
export interface TenantContext {
  tenantId: string;
}

/**
 * AsyncLocalStorage instance shared across the application.
 * The tenant middleware sets this at the start of each request.
 */
export const tenantStorage = new AsyncLocalStorage<TenantContext>();

@Injectable()
export class TenantAwarePrismaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the current tenant ID from AsyncLocalStorage.
   * Throws if no tenant context is set (fail-closed).
   */
  private getCurrentTenantId(): string {
    const context = tenantStorage.getStore();
    if (!context?.tenantId) {
      throw new Error(
        'No tenant context found. Ensure the request passes through TenantMiddleware.',
      );
    }
    return context.tenantId;
  }

  /**
   * Execute a database operation within tenant-scoped RLS context.
   *
   * This wraps the operation in a Prisma transaction that:
   * 1. Sets the PostgreSQL session variable `app.current_tenant`
   * 2. Executes the callback
   * 3. Automatically rolls back the session variable when the transaction ends
   *
   * The `set_config(..., true)` makes the setting transaction-scoped,
   * so it doesn't leak to other requests sharing the same connection.
   */
  async withTenantScope<T>(callback: (prisma: PrismaClient) => Promise<T>): Promise<T> {
    const tenantId = this.getCurrentTenantId();

    return this.prisma.$transaction(async (tx) => {
      // Set the tenant context for this transaction
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant', $1, true)`,
        tenantId,
      );

      return callback(tx as unknown as PrismaClient);
    });
  }

  /**
   * Execute a database operation with an explicit tenant ID.
   * Useful for background workers that don't have request context.
   */
  async withExplicitTenant<T>(
    tenantId: string,
    callback: (prisma: PrismaClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant', $1, true)`,
        tenantId,
      );

      return callback(tx as unknown as PrismaClient);
    });
  }
}
