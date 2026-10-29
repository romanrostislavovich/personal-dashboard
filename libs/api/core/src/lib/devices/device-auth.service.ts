import { Injectable, UnauthorizedException } from '@nestjs/common';

/** The device behind a request's `Authorization: Device <token>`. */
export interface DeviceIdentity {
  id: string;
  userId: string;
}

type Verifier = (authorization: string | undefined) => Promise<DeviceIdentity>;

/**
 * Who sent a device's upload, for any section: the tokens of the user's devices belong to
 * Activity (it pairs the computers and the phone), which registers its check here, so another
 * section (Health, the band's data from the phone) takes uploads without depending on it.
 */
@Injectable()
export class DeviceAuthService {
  private verifier: Verifier | null = null;

  use(verifier: Verifier): void {
    this.verifier = verifier;
  }

  /** Throws 401 for an unknown token, or when no section pairs devices on this server. */
  authenticate(authorization: string | undefined): Promise<DeviceIdentity> {
    if (!this.verifier) {
      throw new UnauthorizedException('Unknown device');
    }
    return this.verifier(authorization);
  }
}
