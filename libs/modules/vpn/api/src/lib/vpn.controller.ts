import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {AuthUser, CurrentUser, ZodValidationPipe} from '@pd/api-core';
import {
  VpnDeviceInput,
  vpnDeviceInputSchema,
  VpnDeviceRename,
  vpnDeviceRenameSchema,
} from '@pd/contracts';
import {z} from 'zod';
import {VpnService} from './vpn.service';

const daysSchema = z.coerce.number().int().min(1).max(366).default(30);

@Controller('vpn')
export class VpnController {
  constructor(private readonly vpn: VpnService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.vpn.status(user.id);
  }

  @Get('days')
  days(
    @CurrentUser() user: AuthUser,
    @Query('days', new ZodValidationPipe(daysSchema)) days: number,
  ) {
    return this.vpn.days(user.id, days);
  }

  /** The device's keys: only for its owner, shown as a QR code or saved as a file. */
  @Get('devices/:id/config')
  config(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vpn.deviceConfig(user.id, id);
  }

  @Post('devices')
  add(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(vpnDeviceInputSchema)) input: VpnDeviceInput,
  ) {
    return this.vpn.addDevice(user.id, input);
  }

  @Patch('devices/:id')
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(vpnDeviceRenameSchema)) input: VpnDeviceRename,
  ) {
    return this.vpn.renameDevice(user.id, id, input);
  }

  @Delete('devices/:id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vpn.removeDevice(user.id, id);
  }
}
