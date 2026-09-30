import { BadRequestException, Injectable } from '@nestjs/common';
import { RecoveryCodes, TwoFactorSetup, TwoFactorStatus } from '@pd/contracts';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { SecretsService } from '../secrets/secrets.service';
import { newTotpSecret, totpUrl, verifyTotp } from './totp';

/** In SecretsService — encrypted, and synced, so a local copy asks for the same codes. */
const SECRET_KEY = 'auth.totp';
const PENDING_KEY = 'auth.totp.pending';
const RECOVERY_KEY = 'auth.totp.recovery';
const RECOVERY_COUNT = 10;
const ISSUER = 'Personal Dashboard';

/**
 * Two-factor sign-in: a code from an authenticator app after the password. Recovery codes (each
 * works once) are for a lost phone; only their hashes are kept.
 */
@Injectable()
export class TwoFactorService {
  constructor(private readonly secrets: SecretsService) {}

  async status(userId: string): Promise<TwoFactorStatus> {
    return {
      enabled: await this.secrets.has(userId, SECRET_KEY),
      recoveryCodesLeft: (await this.recoveryHashes(userId)).length,
    };
  }

  isEnabled(userId: string): Promise<boolean> {
    return this.secrets.has(userId, SECRET_KEY);
  }

  /** A new secret for the app; it does not protect anything until `enable` confirms a code. */
  async setup(userId: string, email: string): Promise<TwoFactorSetup> {
    if (await this.isEnabled(userId)) {
      throw new BadRequestException('Two-factor sign-in is already on');
    }
    const secret = newTotpSecret();
    await this.secrets.set(userId, PENDING_KEY, secret);
    const otpauthUrl = totpUrl(secret, email, ISSUER);
    const svg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1 });
    return {
      secret,
      otpauthUrl,
      qrCode: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    };
  }

  /** The first code from the app proves it was added; returns the recovery codes, once. */
  async enable(userId: string, code: string): Promise<RecoveryCodes | null> {
    const secret = await this.secrets.get(userId, PENDING_KEY);
    if (!secret || !verifyTotp(secret, code)) {
      return null;
    }
    await this.secrets.set(userId, SECRET_KEY, secret);
    await this.secrets.delete(userId, PENDING_KEY);
    const recoveryCodes = Array.from({ length: RECOVERY_COUNT }, newRecoveryCode);
    await this.secrets.set(userId, RECOVERY_KEY, JSON.stringify(recoveryCodes.map(hashCode)));
    return { recoveryCodes };
  }

  async disable(userId: string): Promise<void> {
    await this.secrets.delete(userId, SECRET_KEY);
    await this.secrets.delete(userId, RECOVERY_KEY);
  }

  /** A code from the app, or an unused recovery code (which is then used up). */
  async verify(userId: string, code: string): Promise<boolean> {
    const secret = await this.secrets.get(userId, SECRET_KEY);
    if (!secret) {
      return false;
    }
    if (verifyTotp(secret, code)) {
      return true;
    }
    const hashes = await this.recoveryHashes(userId);
    const given = hashCode(code);
    const index = hashes.findIndex((known) =>
      timingSafeEqual(Buffer.from(known), Buffer.from(given)),
    );
    if (index === -1) {
      return false;
    }
    hashes.splice(index, 1);
    await this.secrets.set(userId, RECOVERY_KEY, JSON.stringify(hashes));
    return true;
  }

  private async recoveryHashes(userId: string): Promise<string[]> {
    const stored = await this.secrets.get(userId, RECOVERY_KEY);
    return stored ? (JSON.parse(stored) as string[]) : [];
  }
}

/** `a1b2c-3d4e5`: easy to type from paper. */
function newRecoveryCode(): string {
  const hex = randomBytes(5).toString('hex');
  return `${hex.slice(0, 5)}-${hex.slice(5)}`;
}

/** Recovery codes are compared without case and dashes. */
function hashCode(code: string): string {
  return createHash('sha256')
    .update(code.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .digest('hex');
}
