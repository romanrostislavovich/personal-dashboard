import { ConfigService } from '@nestjs/config';
import { SUPPORTED_LOCALES, SYNC_MODES } from '@pd/contracts';
import { z } from 'zod';

/**
 * All environment variables are described here. If something is missing,
 * the app fails at startup with a clear error instead of in the middle of work.
 * Example values are in `.env.example` at the repository root.
 */
/**
 * The values of `.env.example` are public: a server started with them signs its sessions with
 * a key anybody knows. A secret that still looks like a placeholder is refused.
 */
const PLACEHOLDER = /change[-_ ]?me|your[-_ ]|example|placeholder|^(.)\1+$/i;
const secret = (name: string) =>
  z
    .string()
    .min(32, `${name} must be at least 32 characters`)
    .refine((value) => !PLACEHOLDER.test(value), {
      message: `${name} is still the placeholder of .env.example: generate a random one`,
    });

export const envSchema = z
  .object({
    API_PORT: z.coerce.number().default(3300),
    DATABASE_URL: z.url(),
    JWT_SECRET: secret('JWT_SECRET'),
    /**
     * Encryption key for integration tokens (GitHub, Sentry…) in the database.
     * Separate from JWT_SECRET: changing the JWT secret must not lose saved tokens.
     * If this key is lost, the tokens have to be entered again.
     */
    ENCRYPTION_KEY: secret('ENCRYPTION_KEY'),
    /** Time zone in which daily jobs run (reminders, recurring payments). */
    APP_TIMEZONE: z.string().default('Europe/Warsaw'),

    /**
     * Allow new users to sign up from the login page.
     * Off by default: a self-hosted dashboard is usually personal.
     */
    ALLOW_REGISTRATION: z.stringbool().default(false),
    /**
     * Whether a site to monitor, a page of a shop or an AI endpoint may be a private or local
     * address (`127.0.0.1`, `192.168.*`, the cloud's metadata). Unset — only while registration
     * is closed: with other users on the instance it would open the server's own network to
     * them (see net/outbound.ts).
     */
    ALLOW_PRIVATE_URLS: z.stringbool().optional(),
    /**
     * A demo instance: one shared user with made-up data that anybody enters without a
     * password and that is made anew every night (see demo/demo.service.ts). Never on an
     * instance with real data.
     */
    DEMO_MODE: z.stringbool().default(false),
    /** Language of the first user (ADMIN_EMAIL): en or ru. */
    DEFAULT_LOCALE: z.enum(SUPPORTED_LOCALES).default('en'),

    /** The first user is created automatically if the database has no users yet. */
    ADMIN_EMAIL: z.email().optional(),
    ADMIN_PASSWORD: z
      .string()
      .min(8)
      .refine((value) => !/change[-_ ]?me/i.test(value), {
        message: 'ADMIN_PASSWORD is still the placeholder of .env.example: choose your own',
      })
      .optional(),

    /** Without a token the Telegram channel is simply disabled. */
    TELEGRAM_BOT_TOKEN: z.string().optional(),

    /**
     * The address the dashboard is opened at. OAuth integrations (Spotify) need it
     * to send the user back. Spotify does not accept `localhost` — only 127.0.0.1.
     */
    PUBLIC_URL: z.url().default('http://127.0.0.1:4200'),

    /** Spotify app (developer.spotify.com). Without them the Spotify connection is disabled. */
    SPOTIFY_CLIENT_ID: z.string().optional(),
    SPOTIFY_CLIENT_SECRET: z.string().optional(),

    /** Path to the built Angular app; if set, the API also serves the frontend. */
    WEB_DIST_PATH: z.string().optional(),
    /**
     * Path to the built code of the desktop shell (dist/apps/desktop/bundle); if set, installed
     * desktop apps update themselves from `/desktop-updates` (apps/desktop/src/update).
     */
    DESKTOP_BUNDLE_PATH: z.string().optional(),

    /** Two-way sync between a local instance and a server, see docs/sync.md. */
    SYNC_MODE: z.enum(SYNC_MODES).default('off'),
    /** Shared secret of the two instances (at least 32 characters, the same on both). */
    SYNC_TOKEN: secret('SYNC_TOKEN').optional(),
    /** Client: the server address, for example https://dash.example.com. */
    SYNC_SERVER_URL: z.url().optional(),
    /** Client: how often to sync. */
    SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60),
    /** Client: its name on the server (defaults to the computer name). */
    SYNC_PEER_NAME: z.string().optional(),

    /**
     * Server: the folder with the daily database dumps (deploy/backup.sh). Set, the dashboard
     * watches them, reports a missing dump or a failed restore check and hands the newest one
     * to the sync client.
     */
    BACKUP_DIR: z.string().optional(),
    /**
     * Server: the folder `deploy/security-scan.sh` writes its hourly report of the host into
     * (`host.json`); the security agent reads it. Without it the server is not looked at.
     */
    SECURITY_DIR: z.string().optional(),
    /** Client: where copies of the server's dumps are kept (docs/deploy.md, "Backups"). */
    BACKUP_COPY_DIR: z.string().default('backups'),
    /** Client: how many copies to keep. */
    BACKUP_COPY_KEEP: z.coerce.number().int().min(1).default(14),
  })
  .superRefine((env, ctx) => {
    if (env.SYNC_MODE !== 'off' && !env.SYNC_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['SYNC_TOKEN'],
        message: 'Required when SYNC_MODE is set',
      });
    }
    if (env.SYNC_MODE === 'client' && !env.SYNC_SERVER_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SYNC_SERVER_URL'],
        message: 'Required in client mode',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Typed ConfigService: `config.get('APP_TIMEZONE', { infer: true })`. */
export type AppConfig = ConfigService<Env, true>;

export function validateEnv(raw: Record<string, unknown>): Env {
  // `SYNC_TOKEN=` in a .env file is "not set", as the examples leave what is optional.
  const set = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(set);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
