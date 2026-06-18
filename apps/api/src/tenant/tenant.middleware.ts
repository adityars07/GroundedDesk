import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { tenantStorage, TenantContext } from '../prisma/tenant-aware-prisma.service';

/**
 * Middleware that extracts the tenant ID from the authenticated user's JWT
 * and stores it in AsyncLocalStorage for the duration of the request.
 *
 * This enables the TenantAwarePrismaService to automatically scope
 * all database queries to the correct tenant via RLS.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const user = (req as any).user;

    if (user?.tenantId) {
      const context: TenantContext = { tenantId: user.tenantId };
      tenantStorage.run(context, () => {
        next();
      });
    } else {
      // No tenant context — let the request proceed without RLS scoping.
      // Protected routes will fail at the guard level, not here.
      next();
    }
  }
}
