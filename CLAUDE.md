# Personal Dashboard — notes for AI assistants

Architecture and rules: `docs/architecture.md`. Quick start: `README.md`. Contribution rules: `CONTRIBUTING.md`.

## Main rules

- Code must be easy to read for humans: small files, clear names, comments where the _why_ is not obvious.
- A module (`libs/modules/*`) depends only on the core (`@pd/api-core`, `@pd/web-core`,
  `@pd/client-core`) and `@pd/contracts`, **never** on another module.
- Every API request (URL, parameters, body) lives in `@pd/client-core` (`libs/client/core`), the
  plain-TypeScript core shared by all clients; a web module's `*.api.ts` only wraps it for Angular.
- Request/response types and zod schemas live only in `libs/shared/contracts`; the backend validates
  with `ZodValidationPipe`.
- Every module table has `userId`; every query filters by it.
- Every table needs a primary key: sync between two instances (`docs/sync.md`) tracks rows by it.
- After changing a `*.schema.ts`, run `npm run db:generate` and commit the migration.
- UI texts go through Transloco (`i18n/en.json` + `i18n/ru.json` of the module, keys must match);
  server texts go to `*.messages.ts` with `en` and `ru` (`pickMessages`).
- Frontend: standalone components, `OnPush`, signals, `httpResource` for reads, Material 3 `matButton` API.
- After every change, check whether `README.md` needs updating (sections, integrations, features)
  and update it in the same change.
- When a module or a tab is added or changed, update its achievements (`*.achievements.ts`): new
  ones for what it now counts, and none left that can no longer be reached.
- After adding a new library, restart `npm run dev` (path aliases are read only on start).

## Skills and hooks (`.claude/`)

- Skills: `/deploy`, `/new-module`, `/new-tab`, `/architecture-review`, `/migration`,
  `/verify-ui`, `/phone`, `/bug` — the project's checklists; use them instead of doing these from
  memory.
- Agent `architecture-reviewer` (`.claude/agents/`): the `/architecture-review` checklist in a
  read-only subagent, for a feature branch before it is merged.
- Hooks (`.claude/settings.json`): a new session starts with the branch, what is not committed,
  main's commits made elsewhere, CI of main and the commit the server runs; every edited file is formatted by prettier and fixed by eslint
  (what eslint cannot fix comes back as an error); `git commit` is blocked while the staged files
  fail lint.
- Style: Google's TypeScript style (gts) — its prettier settings (80 columns, no bracket spacing,
  trailing commas, arrows without parentheses) and rules (`===` only, no floating promises).

## Nx

- Run tasks through Nx: `npx nx run-many -t lint test build`, `npx nx serve web`.
- Do not guess generator flags — check `--help`.
