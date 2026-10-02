import { ConfigService } from '@nestjs/config';
import { SUPPORTED_LOCALES, SYNC_MODES } from '@pd/contracts';
import { z } from 'zod';

/**
 * All environment variables are described here. If something is missing,
 * the app fails at startup with a clear error instead of in the middle of work.
 * Example values are in `.env.example` at the repository root.
 */
export const envSchema = z
  .object({
    API_PORT: z.coerce.number().default(3300),
    DATABASE_URL: z.url(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    /**
     * Encryption key for integration tokens (GitHub, Sentry…) in the database.
     * Separate from JWT_SECRET: changing the JWT secret must not lose saved tokens.
     * If this key is lost, the tokens have to be entered again.
     */
    ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),
    /** Time zone in which daily jobs run (reminders, recurring payments). */
    APP_TIMEZONE: z.string().default('Europe/Warsaw'),

    /**
     * Allow new users to sign up from the login page.
     * Off by default: a self-hosted dashboard is usually personal.
     */
    ALLOW_REGISTRATION: z.stringbool().default(false),
    /** Language of the first user (ADMIN_EMAIL): en or ru. */
    DEFAULT_LOCALE: z.enum(SUPPORTED_LOCALES).default('en'),

    /** The first user is created automatically if the database has no users yet. */
    ADMIN_EMAIL: z.email().optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),

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
    SYNC_TOKEN: z.string().min(32, 'SYNC_TOKEN must be at least 32 characters').optional(),
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
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
