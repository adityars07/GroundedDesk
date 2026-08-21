import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAwarePrismaService } from '../prisma/tenant-aware-prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  tenantId: string;
  role: UserRole;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantAwarePrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Register a new user and create their tenant workspace.
   * The first user becomes the OWNER of the tenant.
   */
  async register(dto: RegisterDto) {
    const existing = await this.prisma.withBypassRls((prisma) =>
      prisma.user.findFirst({
        where: { email: dto.email },
      }),
    );

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.workspaceName,
          slug: this.generateSlug(dto.workspaceName),
          settings: {
            welcomeMessage: 'Hi! How can I help you today?',
            confidenceThreshold: 0.6,
            widgetColor: '#6366f1',
            widgetPosition: 'bottom-right',
          },
        },
      });

      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant', $1, true)`,
        tenant.id,
      );

      const hashedPassword = await bcrypt.hash(dto.password, 12);

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          name: dto.name,
          role: UserRole.OWNER,
          password: hashedPassword,
          provider: 'email',
        },
      });

      return { tenant, user };
    });

    const token = this.generateToken(result.user);

    return {
      user: this.sanitizeUser(result.user),
      tenant: result.tenant,
      token,
    };
  }

  /**
   * Authenticate a user with email + password.
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.withBypassRls((prisma) =>
      prisma.user.findFirst({
        where: { email: dto.email },
        include: { tenant: true },
      }),
    );

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = this.generateToken(user);

    return {
      user: this.sanitizeUser(user),
      tenant: user.tenant,
      token,
    };
  }

  /**
   * Handle Google OAuth callback.
   * Creates a new user/tenant if first time, otherwise returns existing.
   */
  async handleOAuthLogin(profile: {
    email: string;
    name: string;
    avatar?: string;
    provider: string;
  }) {
    let user = await this.prisma.withBypassRls((prisma) =>
      prisma.user.findFirst({
        where: { email: profile.email },
        include: { tenant: true },
      }),
    );

    if (!user) {
      const result = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: `${profile.name}'s Workspace`,
            slug: this.generateSlug(profile.name),
            settings: {
              welcomeMessage: 'Hi! How can I help you today?',
              confidenceThreshold: 0.6,
              widgetColor: '#6366f1',
              widgetPosition: 'bottom-right',
            },
          },
        });

        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant', $1, true)`,
          tenant.id,
        );

        const newUser = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: profile.email,
            name: profile.name,
            role: UserRole.OWNER,
            avatar: profile.avatar,
            provider: profile.provider,
          },
        });

        return { tenant, user: newUser };
      });

      user = { ...result.user, tenant: result.tenant } as any;
    }

    const token = this.generateToken(user!);

    return {
      user: this.sanitizeUser(user!),
      tenant: (user as any).tenant,
      token,
    };
  }

  /**
   * Validate JWT payload — called by JwtStrategy.
   */
  async validateJwtPayload(payload: JwtPayload) {
    const user = await this.tenantPrisma.withExplicitTenant(payload.tenantId, (prisma) =>
      prisma.user.findUnique({
        where: { id: payload.sub },
        include: { tenant: true },
      }),
    );

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  /**
   * Verify a JWT token string and return the payload.
   * Used by AgentGateway to authenticate admin users connecting over WebSockets.
   */
  async verifyToken(token: string): Promise<JwtPayload & { name?: string; email?: string }> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      const user = await this.tenantPrisma.withExplicitTenant(payload.tenantId, (prisma) =>
        prisma.user.findUnique({ where: { id: payload.sub } }),
      );
      return { ...payload, name: user?.name ?? undefined, email: user?.email ?? payload.email };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Validate API key for widget authentication.
   * Returns the tenant associated with the API key.
   */
  async validateApiKey(key: string) {
    const prefix = key.substring(0, 16);

    const apiKey = await this.prisma.withBypassRls((prisma) =>
      prisma.apiKey.findFirst({
        where: { keyPrefix: prefix },
        include: { tenant: true },
      }),
    );

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    const isValid = await bcrypt.compare(key, apiKey.keyHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid API key');
    }

    await this.tenantPrisma.withExplicitTenant(apiKey.tenantId, (prisma) =>
      prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      }),
    );

    return apiKey.tenant;
  }

  /**
   * Generate a new API key for a tenant.
   */
  async generateApiKey(tenantId: string, name: string) {
    const rawKey = `gd_live_${this.generateRandomString(32)}`;
    const keyHash = await bcrypt.hash(rawKey, 10);
    const keyPrefix = rawKey.substring(0, 16);

    const apiKey = await this.tenantPrisma.withExplicitTenant(tenantId, (prisma) =>
      prisma.apiKey.create({
        data: {
          tenantId,
          name,
          keyHash,
          keyPrefix,
        },
      }),
    );

    // Return the raw key only once — it can't be retrieved later
    return {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      keyPrefix,
      createdAt: apiKey.createdAt,
    };
  }

  async listTeamMembers(tenantId: string) {
    return this.tenantPrisma.withExplicitTenant(tenantId, (prisma) =>
      prisma.user.findMany({
        where: { tenantId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatar: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async inviteTeamMember(tenantId: string, dto: { email: string; name?: string; role: UserRole; password?: string }) {
    const existing = await this.prisma.withBypassRls((prisma) =>
      prisma.user.findFirst({
        where: { email: dto.email },
      }),
    );
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    const defaultPassword = dto.password || 'TemporaryPassword123!';
    const hashedPassword = await bcrypt.hash(defaultPassword, 12);
    return this.tenantPrisma.withExplicitTenant(tenantId, (prisma) =>
      prisma.user.create({
        data: {
          tenantId,
          email: dto.email,
          name: dto.name,
          role: dto.role,
          password: hashedPassword,
          provider: 'email',
        },
      }),
    );
  }

  async updateMemberRole(tenantId: string, userId: string, targetUserId: string, role: UserRole) {
    return this.tenantPrisma.withExplicitTenant(tenantId, async (prisma) => {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
      });
      if (!targetUser || targetUser.tenantId !== tenantId) {
        throw new ConflictException('User not found in this tenant');
      }
      if (userId === targetUserId) {
        throw new ConflictException('You cannot change your own role');
      }
      if (targetUser.role === UserRole.OWNER && role !== UserRole.OWNER) {
        const ownersCount = await prisma.user.count({
          where: { tenantId, role: UserRole.OWNER },
        });
        if (ownersCount <= 1) {
          throw new ConflictException('Cannot demote the last owner of the workspace');
        }
      }
      return prisma.user.update({
        where: { id: targetUserId },
        data: { role },
      });
    });
  }

  async removeTeamMember(tenantId: string, userId: string, targetUserId: string) {
    return this.tenantPrisma.withExplicitTenant(tenantId, async (prisma) => {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
      });
      if (!targetUser || targetUser.tenantId !== tenantId) {
        throw new ConflictException('User not found in this tenant');
      }
      if (userId === targetUserId) {
        throw new ConflictException('You cannot remove yourself');
      }
      if (targetUser.role === UserRole.OWNER) {
        const ownersCount = await prisma.user.count({
          where: { tenantId, role: UserRole.OWNER },
        });
        if (ownersCount <= 1) {
          throw new ConflictException('Cannot remove the last owner of the workspace');
        }
      }
      return prisma.user.delete({
        where: { id: targetUserId },
      });
    });
  }

  private generateToken(user: { id: string; email: string; tenantId: string; role: UserRole }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };
    return this.jwtService.sign(payload);
  }

  private sanitizeUser(user: any) {
    const { password, ...sanitized } = user;
    return sanitized;
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = Math.random().toString(36).substring(2, 6);
    return `${base}-${suffix}`;
  }

  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
