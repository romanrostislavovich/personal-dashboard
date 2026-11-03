import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {DB, Database, DemoService} from '@pd/api-core';
import {
  generateKeyPair,
  generateObfuscation,
  generatePresharedKey,
} from './awg-config';
import {vpnDays, vpnDevices, vpnNetworks, vpnServers} from './vpn.schema';

const MB = 1024 * 1024;
const DAYS = 21;

/**
 * The demo data of the VPN: a made-up server, a phone and a laptop with three weeks of traffic.
 * Nothing connects on a demo instance — the keys open nothing.
 */
@Injectable()
export class VpnDemo implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly demo: DemoService,
  ) {}

  onModuleInit(): void {
    this.demo.register({
      module: 'vpn',
      seed: async ({userId, daysAgo}) => {
        const server = generateKeyPair();
        await this.db.insert(vpnServers).values({
          userId,
          privateKey: server.privateKey,
          publicKey: server.publicKey,
          host: 'vpn.example.com',
          port: 37853,
          obfuscation: generateObfuscation(),
          statusAt: new Date(),
          state: 'up',
        });
        const now = Date.now();
        const devices = [
          {
            name: 'Pixel',
            kind: 'phone' as const,
            address: '10.77.0.2',
            mb: 420,
            minutes: 300,
          },
          {
            name: 'ThinkPad',
            kind: 'computer' as const,
            address: '10.77.0.3',
            mb: 900,
            minutes: 180,
          },
        ];
        for (const [index, device] of devices.entries()) {
          const keys = generateKeyPair();
          const [row] = await this.db
            .insert(vpnDevices)
            .values({
              userId,
              name: device.name,
              kind: device.kind,
              privateKey: keys.privateKey,
              publicKey: keys.publicKey,
              presharedKey: generatePresharedKey(),
              address: device.address,
              firstConnectedAt: new Date(now - DAYS * 24 * 60 * 60_000),
              lastHandshakeAt: new Date(
                now - (index ? 3 * 60 * 60_000 : 60_000),
              ),
              lastAddress: index ? '198.51.100.24' : '203.0.113.7',
            })
            .returning({id: vpnDevices.id});
          await this.db.insert(vpnNetworks).values({
            userId,
            deviceId: row.id,
            network: index ? '198.51.0.0/16' : '203.0.0.0/16',
            address: index ? '198.51.100.24' : '203.0.113.7',
          });
          await this.db.insert(vpnDays).values(
            Array.from({length: DAYS}, (_, ago) => {
              // Weekends and a few evenings more, a couple of days without the VPN.
              const share = ago % 7 === 3 ? 0 : 0.4 + ((ago * 37) % 60) / 100;
              return {
                userId,
                deviceId: row.id,
                day: daysAgo(ago),
                rxBytes: Math.round(device.mb * share * 0.1 * MB),
                txBytes: Math.round(device.mb * share * MB),
                onlineMinutes: Math.round(device.minutes * share),
              };
            }),
          );
        }
      },
    });
  }
}
