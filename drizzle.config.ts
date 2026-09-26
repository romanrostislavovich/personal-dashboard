import { defineConfig } from 'drizzle-kit';

/**
 * Схемы таблиц лежат рядом с кодом модулей (`*.schema.ts`).
 * `npm run db:generate` собирает их все и создаёт SQL-миграцию в apps/api/migrations.
 * Применяются миграции автоматически при старте API.
 */
export default defineConfig({
  dialect: 'postgresql',
  casing: 'snake_case',
  schema: ['./libs/**/src/**/*.schema.ts'],
  out: './apps/api/migrations',
});
