import {Injectable, OnModuleInit} from '@nestjs/common';
import {ServerActions} from '@pd/api-core';
import {vpnDeviceInputSchema, vpnDeviceRenameSchema} from '@pd/contracts';
import {z} from 'zod';
import {VpnService} from './vpn.service';

/**
 * The devices are changed on the server only (see ServerActions): two instances adding at once
 * would hand out the same address, and a device deleted on a copy could come back with the
 * other side's version.
 */
export const VPN_ACTIONS = {
  add: 'vpn.add-device',
  rename: 'vpn.rename-device',
  remove: 'vpn.remove-device',
} as const;

const idSchema = z.object({id: z.uuid()});

@Injectable()
export class VpnServerActions implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly vpn: VpnService,
  ) {}

  onModuleInit(): void {
    this.actions.register(VPN_ACTIONS.add, (userId, args) =>
      this.vpn.addDevice(userId, vpnDeviceInputSchema.parse(args)),
    );
    this.actions.register(VPN_ACTIONS.rename, (userId, args) =>
      this.vpn.renameDevice(
        userId,
        idSchema.parse(args).id,
        vpnDeviceRenameSchema.parse(args),
      ),
    );
    this.actions.register(VPN_ACTIONS.remove, (userId, args) =>
      this.vpn.removeDevice(userId, idSchema.parse(args).id),
    );
  }
}
