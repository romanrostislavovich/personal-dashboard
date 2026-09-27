import { defineConfig } from 'drizzle-kit';

/**
 * Table schemas live next to the module code (`*.schema.ts`).
 * `npm run db:generate` collects them all and creates an SQL migration in apps/api/migrations.
 * Migrations are applied automatically when the API starts.
 */
export default defineConfig({
  dialect: 'postgresql',
  casing: 'snake_case',
  schema: ['./libs/**/src/**/*.schema.ts'],
  out: './apps/api/migrations',
});
