import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

/**
 * Guard that validates API keys sent in the x-api-key header.
 * Used for widget authentication (no user login needed).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    try {
      const tenant = await this.authService.validateApiKey(apiKey);
      request.tenant = tenant;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid API key');
    }
  }
}
