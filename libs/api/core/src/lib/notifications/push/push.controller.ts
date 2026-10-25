import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  PushDeviceInput,
  pushDeviceInputSchema,
  PushKey,
  pushKeySchema,
  PushStatus,
} from '@pd/contracts';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { coreMessages } from '../../i18n/core.messages';
import { ServerKeysService } from '../../server-keys/server-keys.service';
import { UsersService } from '../../users/users.service';
import { ZodValidationPipe } from '../../validation/zod-validation.pipe';
import { PushService } from './push.service';

/**
 * Push notifications on phones: the Android app registers its token (`devices`), the owner sets
 * the server's Firebase key (`key`), Settings → Notifications shows both and sends a test.
 */
@Controller('push')
export class PushController {
  constructor(
    private readonly push: PushService,
    private readonly keys: ServerKeysService,
    private readonly users: UsersService,
  ) {}

  @Get()
  status(@CurrentUser() user: AuthUser): Promise<PushStatus> {
    return this.push.status(user.id);
  }

  @Put('devices/:id')
  @HttpCode(204)
  register(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(pushDeviceInputSchema)) input: PushDeviceInput,
  ): Promise<void> {
    return this.push.register(user.id, id, input);
  }

  @Delete('devices/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.push.remove(user.id, id);
  }

  /** To every phone of the user now, past the outbox: whether the chain works. */
  @Post('test')
  async test(@CurrentUser() user: AuthUser): Promise<{ sent: number }> {
    const row = await this.users.findById(user.id);
    if (!row) {
      throw new NotFoundException();
    }
    const sent = await this.push.send(row, {
      title: 'Personal Dashboard',
      body: coreMessages(row.locale).testNotification,
      source: 'core',
    });
    return { sent };
  }

  @Put('key')
  @HttpCode(204)
  async setKey(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(pushKeySchema)) input: PushKey,
  ): Promise<void> {
    await this.keys.assertOwner(user.id);
    await this.push.setKey(input.serviceAccount);
  }

  @Delete('key')
  @HttpCode(204)
  async removeKey(@CurrentUser() user: AuthUser): Promise<void> {
    await this.keys.assertOwner(user.id);
    await this.push.removeKey();
  }
}
