# Архитектура

## Главная идея: ядро + модули

```
                ┌──────────────────── ядро ────────────────────┐
  apps/api ───► │ libs/api/core: БД · auth · проекты ·           │
                │   планировщик · уведомления (каналы)           │
  apps/web ───► │ libs/web/core: layout · auth · i18n ·          │ ◄── libs/shared/contracts
                │   главная с виджетами · SDK модулей            │     (типы + zod-схемы)
                └───────────▲───────────────────▲───────────────┘
                            │                   │
                 libs/modules/birthdays   libs/modules/finance   … (dota, lastfm, github-oss)
                      api/ + web/              api/ + web/
```

Каждая фича — это **модуль** из двух библиотек (`api` и `web`). Модуль зависит только от ядра
и контрактов, а **от других модулей — никогда**. Это правило проверяет ESLint
(`@nx/enforce-module-boundaries`, теги `type:module` / `type:core` / `type:contracts`),
поэтому любой модуль можно удалить или отключить, и ничего не сломается.

Приложения (`apps/*`) — тонкие хосты: в них нет бизнес-логики, только список включённых модулей:

- `apps/api/src/modules.ts`
- `apps/web/src/app/modules.ts`

## Ключевые решения

| Решение                                | Почему                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nx-монорепо**                        | Angular и Nest в одном репозитории, общие типы, граница между модулями проверяется линтером                                                           |
| **Контракты на zod** (`@pd/contracts`) | одна схема задаёт и TS-тип для фронта, и валидацию на бэке (`ZodValidationPipe`)                                                                      |
| **Drizzle ORM**                        | таблицы описываются в TS рядом с модулем (`*.schema.ts`), а не в одном общем файле; SQL-миграции читаются глазами                                     |
| **pg-boss** для фоновых задач          | очередь и cron живут в той же PostgreSQL, отдельный Redis не нужен; пропущенные запуски догоняются                                                    |
| **Уведомления через каналы**           | модуль вызывает `notifications.send()` и не знает, куда уйдёт сообщение; Telegram — первый `NotificationChannel`, Discord/e-mail/push добавятся рядом |
| **Все данные привязаны к `userId`**    | сейчас пользователь один, но публичная многопользовательская версия не потребует переделки схемы                                                      |
| **Один Docker-образ**                  | API раздаёт собранный фронтенд — self-hosting одной командой                                                                                          |
| **Electron — тонкая оболочка**         | desktop грузит тот же web с сервера (или с localhost) и добавляет трей, автозапуск и работу в фоне                                                    |
| **i18n через Transloco**               | каждый модуль хранит переводы у себя (`i18n/ru.json`), ядро собирает их в один словарь                                                                |

## Как устроен модуль

На примере `birthdays`:

```
libs/modules/birthdays/
  api/src/lib/
    birthdays.schema.ts        таблица Drizzle
    birthdays.service.ts       бизнес-логика
    birthdays.controller.ts    REST: /api/birthdays
    birthday-reminders.job.ts  фоновая задача (регистрируется в планировщике)
    birthdays.messages.ts      тексты уведомлений по языкам
    next-birthday.ts (+ .spec) чистая логика — легко тестировать
    birthdays.module.ts        Nest-модуль
  web/src/lib/
    birthdays.api.ts           HTTP-клиент
    birthdays.page.ts          страница модуля
    upcoming-birthdays.widget.ts  виджет для главной
    i18n/ru.json               переводы
    birthdays.module.ts        описание модуля для web-ядра (WebDashboardModule)
```

Типы запросов и ответов живут в `libs/shared/contracts/src/lib/birthdays.ts`.

## Как добавить новый модуль

Пусть это будет `lastfm`.

1. **Сгенерируй библиотеки:**
   ```bash
   npx nx g @nx/nest:library libs/modules/lastfm/api --name=lastfm-api --importPath=@pd/lastfm-api --tags=scope:api,type:module
   npx nx g @nx/angular:library libs/modules/lastfm/web --name=lastfm-web --importPath=@pd/lastfm-web --prefix=pd --tags=scope:web,type:module --skipModule
   ```
2. **Контракты:** добавь `libs/shared/contracts/src/lib/lastfm.ts` (zod-схемы и интерфейсы), экспортируй из `index.ts`.
3. **Бэкенд:**
   - таблицы в `lastfm.schema.ts` (ссылки на ядро — через `@pd/api-core/schema`);
   - сервис и контроллер; `@CurrentUser()` даёт текущего пользователя, `ZodValidationPipe` валидирует вход;
   - фоновые задачи регистрируй в `onModuleInit` через `SchedulerService.register({ name: 'lastfm.sync', cron, handler })`;
   - уведомления — через `NotificationsService.send(userId, { title, body, source: 'lastfm' })`.
4. **Миграция:** `npm run db:generate` → проверь SQL в `apps/api/migrations`.
5. **Фронтенд:** экспортируй объект `WebDashboardModule` с `id`, пунктом меню, маршрутами, переводами и виджетами.
6. **Подключи** модуль в `apps/api/src/modules.ts` и `apps/web/src/app/modules.ts`.

Токены внешних сервисов пользователь вводит в UI модуля, а модуль сохраняет их через
`SecretsService` ядра: `secrets.set(userId, 'lastfm.token', value)`. Значения шифруются AES-256-GCM
ключом `ENCRYPTION_KEY` и никогда не отдаются на фронтенд. Пример — `GithubTokenService` в модуле `github-oss`.

## Сквозные механизмы ядра

- **Секреты интеграций:** `SecretsService` — зашифрованное key-value хранилище на пользователя.
- **Секреты интеграций:** `SecretsService` — зашифрованное key-value хранилище на пользователя.
- **Авторизация:** глобальный `AuthGuard` (JWT); публичные эндпоинты помечаются `@Public()`.
- **Конфигурация:** все переменные окружения описаны zod-схемой в `libs/api/core/src/lib/config/env.ts`;
  при ошибке приложение не стартует и пишет, что не так.
- **Даты:** «календарные» даты (день рождения, дата операции) хранятся как `YYYY-MM-DD` без часового пояса;
  «сегодня» считается в `APP_TIMEZONE` (`todayIn()` в контрактах).
- **Деньги:** `numeric(14,2)`, суммы в разных валютах не конвертируются, а считаются отдельно.
