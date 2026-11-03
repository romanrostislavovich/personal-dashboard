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
import {
  AuthUser,
  CurrentUser,
  ServerActions,
  ZodValidationPipe,
} from '@pd/api-core';
import {
  VpnDevice,
  VpnDeviceInput,
  vpnDeviceInputSchema,
  VpnDeviceRename,
  vpnDeviceRenameSchema,
  vpnDaysQuerySchema,
} from '@pd/contracts';
import {VPN_ACTIONS} from './vpn.server-actions';
import {VpnService} from './vpn.service';

@Controller('vpn')
export class VpnController {
  constructor(
    private readonly vpn: VpnService,
    private readonly actions: ServerActions,
  ) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.vpn.status(user.id);
  }

  @Get('days')
  days(
    @CurrentUser() user: AuthUser,
    @Query('days', new ZodValidationPipe(vpnDaysQuerySchema)) days: number,
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
    return this.actions.run<VpnDevice>(user.id, VPN_ACTIONS.add, input);
  }

  @Patch('devices/:id')
  @HttpCode(204)
  async rename(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(vpnDeviceRenameSchema)) input: VpnDeviceRename,
  ) {
    await this.actions.run(user.id, VPN_ACTIONS.rename, {...input, id});
  }

  @Delete('devices/:id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.actions.run(user.id, VPN_ACTIONS.remove, {id});
  }
}
