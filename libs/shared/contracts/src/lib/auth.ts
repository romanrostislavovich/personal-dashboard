import { z } from 'zod';
import { AccountLayout, layoutSchema } from './layout';
import { AccountTheme, themeSchema } from './theme';
import { isValidTimeZone } from './time-zone';

/**
 * Where the refresh token goes: `web` — an httpOnly cookie a script cannot read; `app` (a mobile
 * or desktop app with its own secure storage) — the response body.
 */
export const AUTH_CLIENTS = ['web', 'app'] as const;
export type AuthClient = (typeof AUTH_CLIENTS)[number];

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  client: z.enum(AUTH_CLIENTS).default('web'),
});
export type LoginRequest = z.input<typeof loginSchema>;

/**
 * A signed-in session: a short-lived access token (15 minutes, kept in memory) and the user.
 * A new access token comes from `POST /api/auth/refresh`.
 */
export interface LoginResponse {
  accessToken: string;
  user: CurrentUser;
  /** Only for `client: 'app'`; the web keeps it in a cookie. */
  refreshToken?: string;
}

/** The password was right, a code from the authenticator app is needed too. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  /** Proves the password step for 5 minutes; sent back with the code. */
  challengeToken: string;
}

export type LoginResult = LoginResponse | TwoFactorChallenge;

export function isTwoFactorChallenge(result: LoginResult): result is TwoFactorChallenge {
  return 'twoFactorRequired' in result;
}

export const twoFactorLoginSchema = z.object({
  challengeToken: z.string().min(1),
  /** 6 digits from the app, or a recovery code `xxxxx-xxxxx`. */
  code: z.string().trim().min(6).max(20),
});
export type TwoFactorLogin = z.infer<typeof twoFactorLoginSchema>;

/** `POST /api/auth/refresh` and `/logout`: an app sends its token, the web relies on the cookie. */
export const refreshSchema = z.object({ refreshToken: z.string().min(1).optional() });
export type RefreshRequest = z.infer<typeof refreshSchema>;

/** A device or browser signed in to the account. */
export interface SessionInfo {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  userAgent: string | null;
  ip: string | null;
  /** The session this request came from. */
  current: boolean;
}

export interface TwoFactorStatus {
  enabled: boolean;
  recoveryCodesLeft: number;
}

/** A new secret to add to an authenticator app; it works only after `enable` with a code. */
export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  /** The same as a QR code image (`data:image/svg+xml…`). */
  qrCode: string;
}

export const twoFactorCodeSchema = z.object({ code: z.string().trim().min(6).max(20) });
export type TwoFactorCode = z.infer<typeof twoFactorCodeSchema>;

export const twoFactorDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().trim().min(6).max(20),
});
export type TwoFactorDisable = z.infer<typeof twoFactorDisableSchema>;

/** Shown once after enabling 2FA: each code signs in once when the phone is not at hand. */
export interface RecoveryCodes {
  recoveryCodes: string[];
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  /**
   * The IANA time zone of the device the user last opened the dashboard on (`Europe/Warsaw`):
   * reminders, due dates and the digest follow the user's own clock, wherever the server is.
   * `null` — never opened in a browser yet; the server's zone is used.
   */
  timeZone: string | null;
  /** The look applied on every device; `null` — never set, the built-in one. */
  theme: AccountTheme | null;
  /** Hidden sections and the home page as arranged on every device; `null` — never set. */
  layout: AccountLayout | null;
}

/** Languages of the UI, notifications and AI answers. A new language = translations in every module. */
export const SUPPORTED_LOCALES = ['en', 'ru'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(50),
  locale: z.enum(SUPPORTED_LOCALES).default('en'),
  client: z.enum(AUTH_CLIENTS).default('web'),
});
export type RegisterRequest = z.input<typeof registerSchema>;

/** `POST /api/auth/demo`: coming into a demo instance. */
export const demoLoginSchema = z.object({ client: z.enum(AUTH_CLIENTS).default('web') });

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  /** Sent by the client itself when the device's zone differs from the saved one. */
  timeZone: z.string().max(64).refine(isValidTimeZone, 'Unknown time zone').optional(),
  /** "Apply everywhere": becomes the theme of the account and overrides the devices' own. */
  theme: themeSchema.optional(),
  /** The same for the layout: hidden sections and the widgets of the home page. */
  layout: layoutSchema.optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
export type PasswordChange = z.infer<typeof passwordChangeSchema>;

/** Public server settings — needed by the login page. */
export interface AuthConfig {
  registrationEnabled: boolean;
  /** A demo instance: the login page offers to come in without an account. */
  demo: boolean;
}
