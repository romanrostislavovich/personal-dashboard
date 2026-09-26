import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** То, что лежит в JWT и доступно в контроллерах. */
export interface AuthUser {
  id: string;
  email: string;
}

/** Пример: `list(@CurrentUser() user: AuthUser)`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => context.switchToHttp().getRequest().user,
);
