import { base32Decode, base32Encode, totpCode, totpUrl, verifyTotp } from './totp';

// RFC 6238, appendix B: the SHA-1 secret "12345678901234567890"; the RFC shows 8 digits,
// authenticator apps use the last 6.
const SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(totpCode(SECRET, 59_000)).toBe('287082');
    expect(totpCode(SECRET, 1_111_111_109_000)).toBe('081804');
    expect(totpCode(SECRET, 1_234_567_890_000)).toBe('005924');
    expect(totpCode(SECRET, 20_000_000_000_000)).toBe('353130');
  });

  it('accepts the neighbouring step, not older ones', () => {
    const now = 1_234_567_890_000;
    expect(verifyTotp(SECRET, totpCode(SECRET, now - 30_000), now)).toBe(true);
    expect(verifyTotp(SECRET, totpCode(SECRET, now + 30_000), now)).toBe(true);
    expect(verifyTotp(SECRET, totpCode(SECRET, now - 90_000), now)).toBe(false);
    expect(verifyTotp(SECRET, '12345', now)).toBe(false);
    expect(verifyTotp(SECRET, '005 924', now)).toBe(true);
  });

  it('base32 round trip and the otpauth link', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(totpUrl('ABC', 'me@x.y', 'Personal Dashboard')).toBe(
      'otpauth://totp/Personal%20Dashboard%3Ame%40x.y?secret=ABC&issuer=Personal+Dashboard&algorithm=SHA1&digits=6',
    );
  });
});
