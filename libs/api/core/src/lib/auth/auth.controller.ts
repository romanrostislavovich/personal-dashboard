import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser as CurrentUserDto, LoginRequest, loginSchema } from '@pd/contracts';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { AuthService } from './auth.service';
import { AuthUser, CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) input: LoginRequest) {
    return this.auth.login(input);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<CurrentUserDto> {
    return this.auth.me(user.id);
  }
}
