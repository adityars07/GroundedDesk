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
    let tenantId = (req as any).user?.tenantId;

    if (!tenantId) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const base64Url = parts[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
            const payload = JSON.parse(jsonPayload);
            tenantId = payload.tenantId;
          }
        } catch {
          // Let validation fail in AuthGuard
        }
      }
    }

    if (tenantId) {
      const context: TenantContext = { tenantId };
      tenantStorage.run(context, () => {
        next();
      });
    } else {
      next();
    }
  }
}
