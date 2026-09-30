import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AccessPayload } from './auth.service';
import { AuthUser } from './current-user.decorator';
import { IS_PUBLIC } from './public.decorator';
import { SessionsService } from './sessions.service';

/**
 * Global guard: checks `Authorization: Bearer <access token>` on every request — a valid token of
 * a session that still exists (a signed-out device is refused within a minute).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const [type, token] = (request.headers.authorization ?? '').split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException();
    }

    const payload = await this.jwt.verifyAsync<AccessPayload>(token).catch(() => null);
    // A token without a session is an old 30-day one (before sessions): sign in again.
    if (!payload?.sid || !(await this.sessions.isAlive(payload.sid))) {
      throw new UnauthorizedException();
    }
    request.user = {
      id: payload.sub,
      email: payload.email,
      sessionId: payload.sid,
    } satisfies AuthUser;
    return true;
  }
}
