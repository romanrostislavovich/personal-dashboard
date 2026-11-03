import {Injectable, OnModuleInit} from '@nestjs/common';
import {AiService, NO_PARAMETERS} from '@pd/api-core';
import {VpnService} from './vpn.service';

/** The VPN for the assistant: read only, never a key or a config. */
@Injectable()
export class VpnAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly vpn: VpnService,
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
}
