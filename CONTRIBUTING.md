# Contributing

Thanks for your interest! Bug reports, ideas, translations and pull requests are all welcome.

## Getting started

```bash
npm install
cp .env.example .env     # set JWT_SECRET, ENCRYPTION_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
npm run db:up            # PostgreSQL in Docker
npm run dev              # API on :3300, web on http://localhost:4200
```

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
- Modules must not import other modules — use the core (`@pd/api-core`, `@pd/web-core`) and
  `@pd/contracts`. ESLint will tell you if a boundary is crossed.
- Keep the code readable for humans: small files, clear names, comments where the _why_ is not obvious.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(music): …`, `fix(finance): …`.
- One logical change per pull request; describe what and why, and how you tested it.
- Screenshots are appreciated for UI changes (light and dark theme).

## Ideas for first contributions

- A new cost provider for finance (DigitalOcean, Vercel, OpenAI usage) — see “Adding a cost provider”
  in the architecture docs.
- A new notification channel (Discord, e-mail).
- A translation to another language — see “Adding a language”.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE) and
that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
