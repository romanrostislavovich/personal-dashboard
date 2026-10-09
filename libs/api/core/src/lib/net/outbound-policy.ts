import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/env';
import { setPrivateAddressesAllowed } from './outbound';

/**
 * Whether requests to addresses users give may go to private and local addresses (see
 * outbound.ts). By default — only on an instance nobody else can sign up to;
 * `ALLOW_PRIVATE_URLS` says otherwise either way.
 */
@Injectable()
export class OutboundPolicy implements OnModuleInit {
  private readonly logger = new Logger(OutboundPolicy.name);

  constructor(@Inject(ConfigService) private readonly config: AppConfig) {}

  onModuleInit(): void {
    const registration = this.config.get('ALLOW_REGISTRATION', { infer: true });
    const allowed = this.config.get('ALLOW_PRIVATE_URLS', { infer: true }) ?? !registration;
    setPrivateAddressesAllowed(allowed);
    if (allowed && registration) {
      this.logger.warn(
        'Registration is open and ALLOW_PRIVATE_URLS is on: any user can make the server ' +
          'request addresses of its own network.',
      );
    }
  }
}
