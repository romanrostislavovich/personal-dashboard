import {Injectable, OnModuleInit} from '@nestjs/common';
import {AiService, NO_PARAMETERS, ServerActions} from '@pd/api-core';
import {VpnSwitchResult} from '@pd/contracts';
import {VPN_ACTIONS} from './vpn.server-actions';
import {VpnService} from './vpn.service';

/** The VPN for the assistant: read only, never a key or a config. */
@Injectable()
export class VpnAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly vpn: VpnService,
    private readonly actions: ServerActions,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'vpn_status',
      module: 'vpn',
      description:
        "The user's own VPN (AmneziaWG on the dashboard's server): `state` (up, down, " +
        'starting, off), where devices connect, and every device — online now, first and last ' +
        'connection, the address it came from, bytes today, the networks of 90 days. Useful ' +
        'for "is my VPN working", "is my phone in the VPN", "who connected from where".',
      parameters: NO_PARAMETERS,
      handler: userId => this.vpn.status(userId),
    });

    this.ai.registerTool({
      name: 'vpn_switch',
      module: 'vpn',
      writes: true,
      description:
        "Turns the user's own VPN on or off on one of their devices: `device` is its name (or a " +
        'part of it, e.g. "phone", "laptop"), `on` true or false. The desktop app of that ' +
        'computer switches its tunnel at once; a phone gets a silent push and switches ' +
        'AmneziaWG. Nothing answers back: say it was sent, and that the device shows online ' +
        'within a minute (vpn_status). Useful for "turn the VPN on on my phone".',
      parameters: {
        type: 'object',
        properties: {
          device: {
            type: 'string',
            description: 'the device name, or a part of it',
          },
          on: {type: 'boolean'},
        },
        required: ['device', 'on'],
      },
      handler: (userId, args) => this.switch(userId, args),
    });

    this.ai.registerTool({
      name: 'vpn_days',
      module: 'vpn',
      description:
        'The VPN by day, all devices together: bytes from them (rx) and to them (tx), ' +
        'minutes connected. Days without the VPN are missing.',
      parameters: {
        type: 'object',
        properties: {days: {type: 'number', description: '1–366, default 30'}},
      },
      handler: (userId, args) =>
        this.vpn.days(
          userId,
          Math.min(366, Math.max(1, Number(args['days']) || 30)),
        ),
    });
  }

  private async switch(
    userId: string,
    args: Record<string, unknown>,
  ): Promise<VpnSwitchResult | {error: string}> {
    const wanted = String(args['device'] ?? '')
      .trim()
      .toLowerCase();
    const devices = (await this.vpn.status(userId)).devices;
    const matching = devices.filter(
      device =>
        device.name.toLowerCase().includes(wanted) || device.kind === wanted,
    );
    if (matching.length !== 1) {
      // The model asks which one: the names are there.
      return {
        error: matching.length
          ? `More than one device matches: ${matching.map(device => device.name).join(', ')}`
          : `No such device; the devices: ${devices.map(device => device.name).join(', ')}`,
      };
    }
    return this.actions.run<VpnSwitchResult>(userId, VPN_ACTIONS.switch, {
      id: matching[0].id,
      up: args['on'] === true,
    });
  }
}
