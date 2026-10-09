# Contributing

Thanks for your interest! Bug reports, ideas, translations and pull requests are all welcome.

## Getting started

```bash
npm install
cp .env.example .env     # set JWT_SECRET, ENCRYPTION_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
npm run db:up            # PostgreSQL in Docker
npm run dev              # API on :3300, web on http://localhost:4200
```

| Command                     | What it does                                         |
| --------------------------- | ---------------------------------------------------- |
| `npm run dev`               | API + web in development mode                        |
| `npm run dev:desktop`       | Desktop shell on top of the dev server               |
| `npm run db:up`             | Start PostgreSQL in Docker                           |
| `npm run db:generate`       | Create an SQL migration after changing `*.schema.ts` |
| `npm test` / `npm run lint` | Tests / linter for all projects                      |
| `npm run build`             | Production build of API and web                      |
| `npm run desktop:package`   | Build a desktop installer                            |

If port 5432 is taken by another PostgreSQL, set `DB_PORT=5433` in `.env` and update the port in
`DATABASE_URL`.

Read [docs/architecture.md](docs/architecture.md) first — it explains how the core and the modules
fit together and has a step-by-step guide to writing a module.

## Before opening a pull request

```bash
npm run lint
npm test
npm run build
npx prettier --check "apps/**/*.{ts,html,scss}" "libs/**/*.{ts,html,scss,json}"
```

- If you changed a `*.schema.ts`, run `npm run db:generate` and commit the migration.
- UI texts go to `i18n/en.json` **and** `i18n/ru.json` of the module (keys must match);
  server texts go to `*.messages.ts` with both `en` and `ru`.
- Keep pure logic (dates, calculations) in small functions with unit tests next to them.
- Tests that need PostgreSQL (`*.db.spec.ts`) run only when `TEST_DATABASE_URL` is set, e.g.
  `TEST_DATABASE_URL=postgres://dashboard:dashboard@localhost:5432/dashboard npm test` with
  `npm run db:up` running (use your `DB_PORT` if it differs). CI always runs them.
- Modules must not import other modules — use the core (`@pd/api-core`, `@pd/web-core`,
  `@pd/client-core`) and `@pd/contracts`. ESLint will tell you if a boundary is crossed. What
  one module knows and another needs goes through the core: see "Links between the sections"
  in the architecture docs (`<module>.links.ts`).
- Request and response types and their zod schemas live in `libs/shared/contracts`; every API
  request (URL, parameters, body) lives in `libs/client/core`, and a web module's `*.api.ts`
  only wraps it for Angular.
- Every table of a module has `userId` and every query filters by it; every table has a
  primary key (the sync between two instances tracks rows by it).
- A request to an address a user gives goes through `safeFetch` of `@pd/api-core`, never plain
  `fetch`: it keeps other users out of the server's own network.
- Keep the code readable for humans: small files, clear names, comments where the _why_ is not obvious.

## Dependency overrides

`overrides` in `package.json` pin patched versions of transitive dependencies that `npm audit`
flags, or relax a peer range that is behind, while the parent has no fixed release yet. Remove an
entry once its parent ships the fix (check with `npm ls <package>` and `npm audit`):

- `nx` → `smol-toml`: nx pins 1.6.1 (DoS on malformed TOML).
- `nx` → `axios`, `brace-expansion`: nx pins axios 1.18 and brace-expansion 5.0.9, both with
  known advisories (prototype pollution, ReDoS). Build tooling only — neither reaches the app.
- `sockjs` → `uuid`: sockjs (via webpack-dev-server) is unmaintained and asks for uuid 8; it only
  calls `v4()`, which uuid 11 still has.
- `@nx/nest` → `@nestjs/common`, `@nestjs/core`: @nx/nest 23.2 still declares NestJS below 12 as a
  peer. It only provides generators (see docs/architecture.md), so it runs fine with NestJS 12.
- `@esbuild-kit/core-utils` → `esbuild`: drizzle-kit still depends on esbuild-kit, which asks for
  esbuild 0.18; it uses the same esbuild as the rest of the repo instead.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(music): …`, `fix(finance): …`.
- One logical change per pull request; describe what and why, and how you tested it.
- Screenshots are appreciated for UI changes (light and dark theme).

## Ideas for first contributions

- A new cost provider for finance (DigitalOcean, Vercel, OpenAI usage) — see “Adding a cost provider”
  in the architecture docs.
- A new notification channel (Discord, e-mail).
- A translation to another language — see “Adding a language”.
- More starting points: [docs/good-first-issues.md](docs/good-first-issues.md).

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE) and
that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
