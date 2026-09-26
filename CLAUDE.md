# Personal Dashboard — заметки для AI-ассистентов

Архитектура и правила — в `docs/architecture.md`, быстрый старт — в `README.md`.

## Главные правила

- Код должен легко читаться человеком: маленькие файлы, понятные имена, комментарии на русском там, где неочевидно «почему».
- Модуль (`libs/modules/*`) зависит только от ядра (`@pd/api-core`, `@pd/web-core`) и `@pd/contracts`, **никогда** от других модулей.
- Типы запросов/ответов и zod-схемы — только в `libs/shared/contracts`; бэкенд валидирует через `ZodValidationPipe`.
- Все таблицы модулей содержат `userId`; все запросы фильтруются по нему.
- После изменения `*.schema.ts` — `npm run db:generate` и закоммитить миграцию.
- Тексты UI — только через Transloco (`i18n/ru.json` модуля), тексты уведомлений — в `*.messages.ts`.
- Фронтенд: standalone-компоненты, `OnPush`, signals, `httpResource` для чтения, `matButton`-API Material 3.

## Nx

- Запускай задачи через Nx: `npx nx run-many -t lint test build`, `npx nx serve web`.
- Не угадывай флаги генераторов — смотри `--help`.
