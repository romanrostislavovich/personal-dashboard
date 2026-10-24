import { createVerify, generateKeyPairSync } from 'node:crypto';
import { DeliveryError } from '../notification-channel';
import { FcmClient, fcmFailure, parseServiceAccount, signedJwt } from './fcm';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const json = JSON.stringify({
  type: 'service_account',
  project_id: 'pd-test',
  client_email: 'push@pd-test.iam.gserviceaccount.com',
  private_key: privateKey,
});

describe('Firebase Cloud Messaging', () => {
  it('takes only the key of a service account', () => {
    expect(parseServiceAccount(json)).toEqual({
      projectId: 'pd-test',
      clientEmail: 'push@pd-test.iam.gserviceaccount.com',
      privateKey,
    });
    expect(() => parseServiceAccount('{')).toThrow(/Not JSON/);
    expect(() => parseServiceAccount(JSON.stringify({ type: 'authorized_user' }))).toThrow(
      /service account/,
    );
  });

  it('signs the assertion with the private key for the messaging scope', () => {
    const jwt = signedJwt(parseServiceAccount(json), Date.UTC(2026, 9, 24));
    const [header, claims, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({
      iss: 'push@pd-test.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
    });
    const valid = createVerify('RSA-SHA256')
      .update(`${header}.${claims}`)
      .verify(publicKey, Buffer.from(signature, 'base64url'));
    expect(valid).toBe(true);
  });

  it('forgets a phone whose token is gone, and tries the rest again later', () => {
    expect(fcmFailure(404, '{"error":{"status":"NOT_FOUND"}}', null)).toBe('gone');
    expect(
      fcmFailure(400, 'The registration token is not a valid FCM registration token', null),
    ).toBe('gone');
    expect(fcmFailure(403, '{"errorCode":"SENDER_ID_MISMATCH"}', null)).toBe('gone');
    try {
      fcmFailure(429, 'QUOTA_EXCEEDED', '30');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DeliveryError);
      expect((error as DeliveryError).options).toEqual({ retryAfterMs: 30_000 });
    }
  });

  it('takes an access token once and sends the notification to the phone', async () => {
    const http = vi.fn(async (url: string | URL) =>
      String(url).includes('oauth2')
        ? new Response(JSON.stringify({ access_token: 'at-1', expires_in: 3600 }))
        : new Response('{}'),
    );
    const fcm = new FcmClient(parseServiceAccount(json), http);
    await fcm.send('device-1', { title: 'T', body: 'B' });
    expect(await fcm.send('device-2', { title: 'T', body: 'x'.repeat(2000) })).toBe('sent');

    expect(http).toHaveBeenCalledTimes(3);
    const [url, init] = http.mock.calls[2] as unknown as [string, RequestInit];
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/pd-test/messages:send');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer at-1');
    const message = JSON.parse(String(init.body)).message;
    expect(message.token).toBe('device-2');
    expect(message.notification.body).toHaveLength(1001);
  });

  it('says when Firebase refuses the key', async () => {
    const http = vi.fn(
      async () =>
        new Response(JSON.stringify({ error_description: 'Invalid JWT' }), { status: 400 }),
    );
    await expect(new FcmClient(parseServiceAccount(json), http).verify()).rejects.toThrow(
      /refused the key: Invalid JWT/,
    );
  });
});
