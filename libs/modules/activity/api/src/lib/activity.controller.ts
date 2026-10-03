import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser, Public, ZodValidationPipe } from '@pd/api-core';
import {
  ActivityApp,
  ActivityAppUpdate,
  ActivityComputer,
  ActivityFocusStats,
  ActivityLimit,
  ActivityLimits,
  activityLimitsSchema,
  activityAppUpdateSchema,
  ActivityDayQuery,
  activityDaySchema,
  ActivityDevice,
  ActivityDeviceConfig,
  ActivityDeviceCreated,
  ActivityDeviceInput,
  activityDeviceInputSchema,
  ActivityDeviceUpdate,
  activityDeviceUpdateSchema,
  ActivityIngest,
  activityIngestSchema,
  ActivityPeriod,
  activityPeriodSchema,
  ActivityProjectRule,
  ActivityProjectRuleInput,
  activityProjectRuleInputSchema,
  ActivitySettings,
  ActivitySettingsUpdate,
  activitySettingsUpdateSchema,
  ActivityStats,
  ActivityTimelineEntry,
} from '@pd/contracts';
import { ActivityService } from './activity.service';
import { DevicesService } from './devices.service';
import { WellbeingService } from './wellbeing.service';

/**
 * Time at the computer. Two kinds of callers:
 * - the user (a session): devices, settings, statistics;
 * - a tracker (`/device/*`, `Authorization: Device <token>`): it only sends spans and reads
 *   what not to record.
 */
@Controller('activity')
export class ActivityController {
  constructor(
    private readonly activity: ActivityService,
    private readonly devices: DevicesService,
    private readonly wellbeing: WellbeingService,
  ) {}

  // --- A tracker ---

  /**
   * Saves what the tracker recorded (spans, ended focus sessions, the computer's state) and
   * answers with its settings, so one request does both.
   */
  @Public()
  @Post('device/spans')
  async ingest(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(activityIngestSchema)) body: ActivityIngest,
  ): Promise<ActivityDeviceConfig & { saved: number }> {
    const device = await this.devices.authenticate(authorization);
    const saved = await this.activity.ingest(device, body.spans);
    await this.wellbeing.saveFocus(device, body.focus ?? []);
    if (body.health) {
      await this.wellbeing.saveHealth(device, body.health);
    }
    if (saved > 0) {
      await this.wellbeing.checkLimits(device.userId);
    }
    return { saved, ...(await this.activity.config(device.userId)) };
  }

  // --- The user ---

  @Get('stats')
  stats(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(activityPeriodSchema)) period: ActivityPeriod,
  ): Promise<ActivityStats> {
    return this.activity.stats(user.id, period);
  }

  /** What was in front on one day, newest first. */
  @Get('timeline')
  timeline(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(activityDaySchema)) query: ActivityDayQuery,
  ): Promise<ActivityTimelineEntry[]> {
    return this.activity.timeline(user.id, query);
  }

  @Get('devices')
  listDevices(@CurrentUser() user: AuthUser): Promise<ActivityDevice[]> {
    return this.devices.list(user.id);
  }

  /** Registers a tracker; the token in the answer is shown once. */
  @Post('devices')
  registerDevice(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(activityDeviceInputSchema)) input: ActivityDeviceInput,
  ): Promise<ActivityDeviceCreated> {
    return this.devices.register(user.id, input);
  }

  @Patch('devices/:id')
  @HttpCode(204)
  renameDevice(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(activityDeviceUpdateSchema)) update: ActivityDeviceUpdate,
  ): Promise<void> {
    return this.devices.rename(user.id, id, update.name);
  }

  /** Removes the device with everything it recorded. */
  @Delete('devices/:id')
  @HttpCode(204)
  removeDevice(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.devices.remove(user.id, id);
  }

  @Get('settings')
  settings(@CurrentUser() user: AuthUser): Promise<ActivitySettings> {
    return this.activity.settings(user.id);
  }

  @Put('settings')
  @HttpCode(204)
  saveSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(activitySettingsUpdateSchema)) settings: ActivitySettingsUpdate,
  ): Promise<void> {
    return this.activity.saveSettings(user.id, settings);
  }

  /** Every program seen, with its category and whether it is recorded. */
  @Get('apps')
  apps(@CurrentUser() user: AuthUser): Promise<ActivityApp[]> {
    return this.activity.apps(user.id);
  }

  /** The category of a program, or "do not record it" (what was recorded is deleted). */
  @Patch('apps/:app')
  @HttpCode(204)
  updateApp(
    @CurrentUser() user: AuthUser,
    @Param('app') app: string,
    @Body(new ZodValidationPipe(activityAppUpdateSchema)) update: ActivityAppUpdate,
  ): Promise<void> {
    return this.activity.updateApp(user.id, app, update);
  }

  @Get('rules')
  rules(@CurrentUser() user: AuthUser): Promise<ActivityProjectRule[]> {
    return this.activity.rules(user.id);
  }

  @Post('rules')
  @HttpCode(204)
  addRule(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(activityProjectRuleInputSchema)) input: ActivityProjectRuleInput,
  ): Promise<void> {
    return this.activity.addRule(user.id, input);
  }

  /** Focus sessions of a period with their totals. */
  @Get('focus')
  focus(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(activityPeriodSchema)) period: ActivityPeriod,
  ): Promise<ActivityFocusStats> {
    return this.wellbeing.focusStats(user.id, period);
  }

  @Delete('focus/:id')
  @HttpCode(204)
  removeFocus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.wellbeing.removeFocus(user.id, id);
  }

  @Get('limits')
  limits(@CurrentUser() user: AuthUser): Promise<ActivityLimit[]> {
    return this.wellbeing.limits(user.id);
  }

  /** The whole set of daily limits at once. */
  @Put('limits')
  @HttpCode(204)
  saveLimits(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(activityLimitsSchema)) body: ActivityLimits,
  ): Promise<void> {
    return this.wellbeing.saveLimits(user.id, body.limits);
  }

  /** The computers with their latest state and the last day of load. */
  @Get('computers')
  computers(@CurrentUser() user: AuthUser): Promise<ActivityComputer[]> {
    return this.wellbeing.computers(user.id);
  }

  @Delete('rules/:id')
  @HttpCode(204)
  removeRule(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.activity.removeRule(user.id, id);
  }
}
