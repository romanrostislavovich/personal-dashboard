// Только таблицы ядра, без Nest. Отдельная точка входа нужна, чтобы схемы модулей
// можно было импортировать в drizzle-kit (генерация миграций) без поднятия всего ядра.
export * from './lib/users/users.schema';
export * from './lib/projects/projects.schema';
export * from './lib/secrets/secrets.schema';
export * from './lib/achievements/achievements.schema';
