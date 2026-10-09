# Good first issues

Small, self-contained tasks to start with. Each one stays inside one module (or adds a new
file next to existing ones of the same kind), so it can be done without knowing the whole
code base. Read [architecture.md](architecture.md) first; the rules are in
[CONTRIBUTING.md](../CONTRIBUTING.md).

These are also the texts of the first issues to open with the `good first issue` label.

## 1. A translation to another language

**Where:** `libs/web/core/src/lib/i18n/` and `libs/modules/*/web/src/lib/i18n/`, server texts in
`*.messages.ts`.

The dashboard speaks English and Russian. Add a third language: copy `en.json` of the core and
of every module, translate it, add the language to `SUPPORTED_LOCALES` in the contracts and the
texts of the server (`*.messages.ts`: notifications, the bot, achievements). See "Adding a
language" in the architecture docs. A good issue to do section by section — one module a pull
request is fine.

**Done when:** the language can be chosen in the profile, no key falls back to English in the
translated sections, `npm run lint` passes (it checks that the keys of all languages match).

## 2. A cost provider for Finance

**Where:** `libs/modules/finance/api/src/lib/cost-sources/providers/`.

Finance imports monthly costs from Hetzner Cloud and DeepSeek. Add another service you pay
for — DigitalOcean, Vercel, OpenAI usage, Cloudflare: one class next to `hetzner.provider.ts`
that asks the service's billing API with the user's token and returns the amount of a month,
plus its id in `COST_PROVIDERS` and a guide for the integration card. See "Adding a cost
provider" in the architecture docs.

**Done when:** the provider can be connected in Settings → Integrations, a month's amount
arrives as an expense, and the parsing of the API's answer has a unit test on a saved example.

## 3. A notification channel

**Where:** `libs/api/core/src/lib/notifications/`.

Notifications go to Telegram and to the open dashboard. Add Discord (a webhook URL) or e-mail
(SMTP): a class that implements `NotificationChannel` next to `telegram.channel.ts`, added to
the list of `NOTIFICATION_CHANNELS` in `core.module.ts`, with its setting in Settings →
Notifications. A webhook URL is an address a user gives: send to it with `safeFetch`.

**Done when:** a test notification arrives through the new channel, and a failing channel does
not stop the others.

## 4. Commits of a project from self-hosted GitLab

**Where:** `libs/modules/development/api/src/lib/gitlab/gitlab.client.ts`.

The GitLab client talks to `gitlab.com` only (`const API = 'https://gitlab.com/api/v4'`). Let
the user give the address of their own GitLab next to the token (Settings → Integrations) and
use it for the account, the repositories and the commits. The address is the user's: every
request to it goes through `safeFetch`.

**Done when:** a token of a self-hosted GitLab brings its repositories, and `gitlab.com` keeps
working without an address.

## 5. A usage source for subscriptions

**Where:** a module's `<module>.links.ts`, see `music.links.ts` for an example.

Finance → recurring payments shows whether what you pay for is used: Music answers for
streaming services (plays), Activity for programs (time), Games for Steam. Teach another
section to answer: Development for a paid GitHub or WakaTime plan (commits or coding time of
the month), the AI section for a paid AI provider (requests of the month). It is one
`links.registerUsage({ module, usage })` and a translation of the unit.

**Done when:** a recurring payment named after the service shows its use, a unit test covers
the matching of the name, and the modules still do not import each other.

## 6. More shops the wishlist can read

**Where:** `libs/modules/finance/api/src/lib/wishlist/product-page.ts` and its spec.

The wishlist reads a price from a product page's structured data (JSON-LD, Open Graph,
microdata). Some shops mark their pages differently and give no price. Take a shop that is not
read, save a trimmed copy of its page as a test fixture and teach `readProductPage` its markup
without breaking the existing cases.

**Done when:** the new fixture and all the old ones pass in `product-page.spec.ts`.
