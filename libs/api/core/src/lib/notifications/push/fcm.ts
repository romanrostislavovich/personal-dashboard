import { createSign } from 'node:crypto';
import { fetchWithTimeout } from '../../net/outbound';
import { PUSH_CHANNEL } from '@pd/contracts';
import { DeliveryError } from '../notification-channel';

/**
 * Firebase Cloud Messaging (HTTP v1), the way Android delivers push notifications. The server
 * signs in as a service account of the owner's Firebase project: a JWT signed with its private
 * key is exchanged for an access token (an hour), and each notification is sent to one phone's
 * token. No Firebase SDK: two plain HTTP calls.
 */

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
/** An access token lives an hour; a new one is taken a little before. */
const TOKEN_MARGIN_MS = 5 * 60_000;
/** FCM refuses a message over 4 KB; a long body is cut. */
const MAX_BODY = 1000;

/** The JSON downloaded from Firebase → what the server needs of it; throws for anything else. */
export function parseServiceAccount(json: string): ServiceAccount {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error('Not JSON: paste the whole file Firebase gave');
  }
  const { type, project_id, client_email, private_key } = data;
  if (
    type !== 'service_account' ||
    typeof project_id !== 'string' ||
    typeof client_email !== 'string' ||
    typeof private_key !== 'string' ||
    !private_key.includes('PRIVATE KEY')
  ) {
    throw new Error('Not the key of a Firebase service account');
  }
  return { projectId: project_id, clientEmail: client_email, privateKey: private_key };
}

/** What became of one notification to one phone. */
export type FcmResult = 'sent' | 'gone';

export class FcmClient {
  private accessToken: { value: string; until: number } | null = null;

  constructor(
    private readonly account: ServiceAccount,
    private readonly http: typeof fetchWithTimeout = fetchWithTimeout,
  ) {}

  /** Checks the key: an access token is given for it. */
  async verify(): Promise<void> {
    this.accessToken = null;
    await this.token();
  }

  /**
   * `gone` — the phone's token no longer works (the app removed, its data cleared): forget it.
   * A failure worth trying again later throws DeliveryError.
   */
  async send(
    deviceToken: string,
    message: { title: string; body: string; data?: Record<string, string> },
  ): Promise<FcmResult> {
    const body =
      message.body.length > MAX_BODY ? `${message.body.slice(0, MAX_BODY)}…` : message.body;
    const response = await this.http(
      `https://fcm.googleapis.com/v1/projects/${this.account.projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: { title: message.title, body },
            data: message.data ?? {},
            // The app's own channel (MobilePushService makes it): Firebase's fallback one is
            // silent on MIUI.
            android: {
              priority: 'HIGH',
              notification: { sound: 'default', channel_id: PUSH_CHANNEL },
            },
          },
        }),
      },
    );
    if (response.ok) {
      return 'sent';
    }
    return fcmFailure(response.status, await response.text(), response.headers.get('retry-after'));
  }

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.until > Date.now()) {
      return this.accessToken.value;
    }
    const response = await this.http(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signedJwt(this.account),
      }),
    });
    const answer = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!response.ok || !answer.access_token) {
      throw new DeliveryError(
        `Firebase refused the key: ${answer.error_description ?? `HTTP ${response.status}`}`,
      );
    }
    this.accessToken = {
      value: answer.access_token,
      until: Date.now() + (answer.expires_in ?? 3600) * 1000 - TOKEN_MARGIN_MS,
    };
    return answer.access_token;
  }
}

/** The assertion of the OAuth exchange: a JWT signed with the service account's key (RS256). */
export function signedJwt(account: ServiceAccount, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: account.clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.privateKey);
  return `${unsigned}.${signature.toString('base64url')}`;
}

/** FCM's error → forget the phone, or try again later (see DeliveryError). */
export function fcmFailure(status: number, text: string, retryAfter: string | null): FcmResult {
  // The token is unknown (404 UNREGISTERED), broken (400) or of another project (403 mismatch).
  const tokenGone =
    status === 404 ||
    (status === 400 && /registration token/i.test(text)) ||
    (status === 403 && /SENDER_ID_MISMATCH/.test(text));
  if (tokenGone) {
    return 'gone';
  }
  const seconds = Number(retryAfter);
  throw new DeliveryError(`Firebase ${status}: ${text.slice(0, 200)}`, {
    retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined,
  });
}
