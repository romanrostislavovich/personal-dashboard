import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthConfig,
  CurrentUser as CurrentUserDto,
  LoginResponse,
  LoginResult,
  loginSchema,
  PasswordChange,
  passwordChangeSchema,
  ProfileUpdate,
  profileUpdateSchema,
  RecoveryCodes,
  RefreshRequest,
  refreshSchema,
  demoLoginSchema,
  registerSchema,
  SessionInfo,
  TwoFactorCode,
  twoFactorCodeSchema,
  TwoFactorDisable,
  twoFactorDisableSchema,
  TwoFactorLogin,
  twoFactorLoginSchema,
  TwoFactorSetup,
  TwoFactorStatus,
} from '@pd/contracts';
import { z } from 'zod';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import {
  AuthRequest,
  AuthResponse,
  clearRefreshCookie,
  clientMeta,
  refreshTokenOf,
  setRefreshCookie,
} from './auth-http';
import { AuthService, IssuedSession } from './auth.service';
import { AuthUser, CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import { SessionsService } from './sessions.service';
import { TwoFactorService } from './two-factor.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  /** What to show on the login page (for example, a sign-up link). */
  @Public()
  @Get('config')
  config(): AuthConfig {
    return this.auth.publicConfig();
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) input: z.output<typeof loginSchema>,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<LoginResult> {
    const { result, refreshToken } = await this.auth.login(input, clientMeta(request));
    if (refreshToken && input.client === 'web') {
      setRefreshCookie(request, response, refreshToken);
    }
    return result;
  }

  /** The 2FA step of signing in. */
  @Public()
  @Post('login/2fa')
  @HttpCode(200)
  async loginWithCode(
    @Body(new ZodValidationPipe(twoFactorLoginSchema)) input: TwoFactorLogin,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<LoginResponse> {
    return this.started(
      await this.auth.loginWithCode(input, clientMeta(request)),
      request,
      response,
    );
  }

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) input: z.output<typeof registerSchema>,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<LoginResponse> {
    const issued = await this.auth.register(input, input.client, clientMeta(request));
    return this.started(issued, request, response);
  }

  /** "Try the demo" of a demo instance: a session of the shared demo user. */
  @Public()
  @Post('demo')
  @HttpCode(200)
  async demo(
    @Body(new ZodValidationPipe(demoLoginSchema)) input: z.output<typeof demoLoginSchema>,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<LoginResponse> {
    return this.started(
      await this.auth.startDemo(input.client, clientMeta(request)),
      request,
      response,
    );
  }

  /** A new access token; the web's refresh token comes in the cookie, an app's in the body. */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshRequest,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<LoginResponse> {
    const token = refreshTokenOf(request, body.refreshToken);
    if (!token) {
      throw new UnauthorizedException('Signed out');
    }
    try {
      const { response: result, refreshToken } = await this.auth.refresh(
        token,
        clientMeta(request),
      );
      if (refreshToken) {
        if (body.refreshToken) {
          return { ...result, refreshToken };
        }
        setRefreshCookie(request, response, refreshToken);
      }
      return result;
    } catch (error) {
      clearRefreshCookie(request, response);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshRequest,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<void> {
    const token = refreshTokenOf(request, body.refreshToken);
    if (token) {
      await this.auth.logout(token);
    }
    clearRefreshCookie(request, response);
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

  /** Also signs every other device out. */
  @Put('password')
  @HttpCode(204)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(passwordChangeSchema)) input: PasswordChange,
  ) {
    return this.auth.changePassword(user.id, user.sessionId, input);
  }

  // --- Devices signed in ---

  @Get('sessions')
  listSessions(@CurrentUser() user: AuthUser): Promise<SessionInfo[]> {
    return this.sessions.list(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  revokeSession(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.revoke(user.id, id);
  }

  /** "Sign out everywhere else". */
  @Post('sessions/revoke-others')
  @HttpCode(204)
  revokeOtherSessions(@CurrentUser() user: AuthUser) {
    return this.sessions.revokeOthers(user.id, user.sessionId);
  }

  // --- Two-factor sign-in ---

  @Get('2fa')
  twoFactorStatus(@CurrentUser() user: AuthUser): Promise<TwoFactorStatus> {
    return this.twoFactor.status(user.id);
  }

  @Post('2fa/setup')
  @HttpCode(200)
  setupTwoFactor(@CurrentUser() user: AuthUser): Promise<TwoFactorSetup> {
    return this.twoFactor.setup(user.id, user.email);
  }

  @Post('2fa/enable')
  @HttpCode(200)
  async enableTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(twoFactorCodeSchema)) { code }: TwoFactorCode,
  ): Promise<RecoveryCodes> {
    const codes = await this.twoFactor.enable(user.id, code);
    if (!codes) {
      // 400, not 401: a mistyped code must not look like a finished session to the client.
      throw new BadRequestException('Wrong code');
    }
    return codes;
  }

  @Post('2fa/disable')
  @HttpCode(204)
  async disableTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(twoFactorDisableSchema)) { password, code }: TwoFactorDisable,
  ): Promise<void> {
    await this.auth.checkPassword(user.id, password);
    if (!(await this.twoFactor.verify(user.id, code))) {
      throw new BadRequestException('Wrong code');
    }
    await this.twoFactor.disable(user.id);
  }

  private started(
    { response: result, refreshToken }: IssuedSession,
    request: AuthRequest,
    response: AuthResponse,
  ): LoginResponse {
    // An app got the token in the body; the web gets the cookie.
    if (refreshToken && !result.refreshToken) {
      setRefreshCookie(request, response, refreshToken);
    }
    return result;
  }
}
