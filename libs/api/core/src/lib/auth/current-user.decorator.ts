import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** What the JWT carries and controllers can access. */
export interface AuthUser {
  id: string;
  email: string;
}

/** Example: `list(@CurrentUser() user: AuthUser)`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => context.switchToHttp().getRequest().user,
);
