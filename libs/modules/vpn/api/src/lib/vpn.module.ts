import {Module} from '@nestjs/common';
import {VpnAchievements} from './vpn.achievements';
import {VpnAiTools} from './vpn.ai-tools';
import {VpnController} from './vpn.controller';
import {VpnDemo} from './vpn.demo';
import {VpnJobs} from './vpn.jobs';
import {VpnLinks} from './vpn.links';
import {VpnSecurity} from './vpn.security';
import {VpnServerService} from './vpn-server.service';
import {VpnService} from './vpn.service';

/**
 * The owner's own VPN: AmneziaWG in a container next to the dashboard (deploy/vpn), its devices
 * and their traffic. API: `/api/vpn`.
 */
@Module({
  controllers: [VpnController],
  providers: [
    VpnService,
    VpnServerService,
    VpnJobs,
    VpnLinks,
    VpnAchievements,
    VpnSecurity,
    VpnAiTools,
    VpnDemo,
  ],
})
export class VpnModule {}
