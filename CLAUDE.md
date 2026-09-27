# Personal Dashboard — notes for AI assistants

Architecture and rules: `docs/architecture.md`. Quick start: `README.md`. Contribution rules: `CONTRIBUTING.md`.

## Main rules

- Code must be easy to read for humans: small files, clear names, comments where the _why_ is not obvious.
- A module (`libs/modules/*`) depends only on the core (`@pd/api-core`, `@pd/web-core`) and
  `@pd/contracts`, **never** on another module.
- Request/response types and zod schemas live only in `libs/shared/contracts`; the backend validates
  with `ZodValidationPipe`.
- Every module table has `userId`; every query filters by it.
- After changing a `*.schema.ts`, run `npm run db:generate` and commit the migration.
- UI texts go through Transloco (`i18n/en.json` + `i18n/ru.json` of the module, keys must match);
  server texts go to `*.messages.ts` with `en` and `ru` (`pickMessages`).
- Frontend: standalone components, `OnPush`, signals, `httpResource` for reads, Material 3 `matButton` API.
- After adding a new library, restart `npm run dev` (path aliases are read only on start).

## Nx

- Run tasks through Nx: `npx nx run-many -t lint test build`, `npx nx serve web`.
- Do not guess generator flags — check `--help`.
