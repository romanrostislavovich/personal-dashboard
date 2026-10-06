import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  FindingStatusChange,
  findingStatusSchema,
  SecuritySettings,
  securitySettingsSchema,
  SecurityStatus,
} from '@pd/contracts';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ServerActions } from '../sync/server-actions';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { SECURITY_ACTIONS } from './security.jobs';
import { SecurityService } from './security.service';

/** The security agent, for the owner of the instance only: `/api/security`. */
@Controller('security')
export class SecurityController {
  constructor(
    private readonly security: SecurityService,
    private readonly actions: ServerActions,
  ) {}

  @Get()
  async status(@CurrentUser() user: AuthUser): Promise<SecurityStatus> {
    await this.security.assertOwner(user.id);
    return this.security.status(user.id);
  }

  /** "Check now": the rules look at everything again. */
  @Post('scan')
  @HttpCode(200)
  async scan(@CurrentUser() user: AuthUser): Promise<SecurityStatus> {
    await this.security.assertOwner(user.id);
    await this.actions.run(user.id, SECURITY_ACTIONS.scan);
    return this.security.status(user.id);
  }

  /** "Investigate": the AI looks around and writes a report. Takes a minute or two. */
  @Post('investigate')
  @HttpCode(200)
  async investigate(@CurrentUser() user: AuthUser): Promise<SecurityStatus> {
    await this.security.assertOwner(user.id);
    await this.actions.run(user.id, SECURITY_ACTIONS.investigate);
    return this.security.status(user.id);
  }

  @Put('settings')
  @HttpCode(204)
  async saveSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(securitySettingsSchema)) input: SecuritySettings,
  ): Promise<void> {
    await this.security.assertOwner(user.id);
    await this.security.saveSettings(user.id, input);
  }

  /** "How do I fix this?": the AI writes a step-by-step guide for the finding. */
  @Post('findings/:id/guide')
  @HttpCode(200)
  async guide(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SecurityStatus> {
    await this.security.assertOwner(user.id);
    await this.actions.run(user.id, SECURITY_ACTIONS.guide, { id });
    return this.security.status(user.id);
  }

  /** "I know, leave it" — or back to open. */
  @Put('findings/:id')
  @HttpCode(204)
  async setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(findingStatusSchema)) { status }: FindingStatusChange,
  ): Promise<void> {
    await this.security.assertOwner(user.id);
    await this.security.setStatus(user.id, id, status);
  }
}
