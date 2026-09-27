import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

/**
 * Все переменные окружения описаны здесь. Если чего-то не хватает,
 * приложение упадёт на старте с понятной ошибкой, а не посреди работы.
 * Пример значений — в `.env.example` в корне репозитория.
 */
export const envSchema = z.object({
  API_PORT: z.coerce.number().default(3300),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  /**
   * Ключ шифрования токенов интеграций (GitHub, Sentry…) в БД.
   * Отдельный от JWT_SECRET: смена JWT-секрета не должна терять сохранённые токены.
   * Если потерять этот ключ, токены придётся ввести заново.
   */
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),
  /** Часовой пояс, в котором срабатывают ежедневные задачи (напоминания, списания). */
  APP_TIMEZONE: z.string().default('Europe/Warsaw'),

  /** Первый пользователь создаётся автоматически, если в базе ещё никого нет. */
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),

  /** Без токена Telegram-канал просто выключен. */
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  /**
   * Адрес, по которому открывается дашборд. Нужен OAuth-интеграциям (Spotify),
   * чтобы вернуть пользователя обратно. Spotify не принимает `localhost` — только 127.0.0.1.
   */
  PUBLIC_URL: z.url().default('http://127.0.0.1:4200'),

  /** Приложение Spotify (developer.spotify.com). Без них подключение Spotify выключено. */
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),

  /** Путь к собранному Angular-приложению; если задан, API раздаёт и фронтенд. */
  WEB_DIST_PATH: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Типизированный ConfigService: `config.get('APP_TIMEZONE', { infer: true })`. */
export type AppConfig = ConfigService<Env, true>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
