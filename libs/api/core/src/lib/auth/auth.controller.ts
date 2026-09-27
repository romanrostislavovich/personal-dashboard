import { Body, Controller, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import {
  AuthConfig,
  CurrentUser as CurrentUserDto,
  LoginRequest,
  loginSchema,
  PasswordChange,
  passwordChangeSchema,
  ProfileUpdate,
  profileUpdateSchema,
  registerSchema,
} from '@pd/contracts';
import { z } from 'zod';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { AuthService } from './auth.service';
import { AuthUser, CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Что показывать на странице входа (например, ссылку на регистрацию). */
  @Public()
  @Get('config')
  config(): AuthConfig {
    return this.auth.publicConfig();
  }

  @Public()
  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) input: LoginRequest) {
    return this.auth.login(input);
  }

  @Public()
  @Post('register')
  register(@Body(new ZodValidationPipe(registerSchema)) input: z.output<typeof registerSchema>) {
    return this.auth.register(input);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<CurrentUserDto> {
    return this.auth.me(user.id);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(profileUpdateSchema)) changes: ProfileUpdate,
  ): Promise<CurrentUserDto> {
    return this.auth.updateProfile(user.id, changes);
  }

  @Put('password')
  @HttpCode(204)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(passwordChangeSchema)) input: PasswordChange,
  ) {
    return this.auth.changePassword(user.id, input);
  }
}
