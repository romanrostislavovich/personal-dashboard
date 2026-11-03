import {Injectable, OnModuleInit} from '@nestjs/common';
import {SchedulerService} from '@pd/api-core';
import {VpnServerService} from './vpn-server.service';

/**
 * Every minute — the devices written for the VPN container and its status read back; once a
 * day — networks unseen for 90 days forgotten. Only where VPN_DIR is set (the server).
 */
@Injectable()
export class VpnJobs implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly server: VpnServerService,
  ) {}

  onModuleInit(): void {
    if (!this.server.dir) {
      return;
    }
    this.scheduler.register({
      name: 'vpn.tick',
      cron: '* * * * *',
      quiet: true,
      expireMinutes: 5,
      handler: () => this.server.tick(),
    });
    this.scheduler.register({
      name: 'vpn.daily',
      cron: '40 4 * * *',
      handler: () => this.server.forgetOldNetworks(),
    });
  }
}
