# Open-source release checklist

What to do and check before the repository is made public. Work top to bottom: the first
sections are the ones that cannot be undone once the repository is public (anything in git, in
the issues or in the Actions logs is copied and cached the moment it is visible).

## Already checked (2026-10-08)

- No `.env`, `deploy/deploy.local.env`, dumps, keys or certificates were ever committed (all
  history, every branch); only the `*.example` files.
- No token patterns in the history (GitHub, OpenAI-style `sk-`, AWS, Telegram bot, GitLab, Slack,
  private keys) and no real IP addresses — only test placeholders (`1.1.1.1`, `1.2.3.4`...).
- E-mails in the tracked files are placeholders (`me@example.com`, `*@test.local`).
- No default passwords or seeded users in the code.
- `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue and PR templates
  are in place; `security.yml` runs gitleaks over the whole history on every push.

## Done on 2026-10-09

- gitleaks over the whole history of every branch (`--log-opts="--all"`, 177 commits with
  changes): no leaks. trufflehog over the same history, without verifying against outside
  services: one finding — the `dashboard:dashboard` password of the local database in
  `docker-compose.yml`, the well-known one of development; its port now listens on this
  computer only.
- `.env.example` and `deploy/.env.example` hold only placeholders — and the server now refuses
  to start with them (`JWT_SECRET`, `ENCRYPTION_KEY`, `SYNC_TOKEN`, `ADMIN_PASSWORD`).
- Requests to addresses users give go through `safeFetch`: private and local addresses are
  refused once registration is open, on every redirect (`ALLOW_PRIVATE_URLS`).
- Starting the sync and copying a backup are the owner's alone (any signed-in user could).
- The assistant asks before it replaces text in the diary; every tool that deletes or
  overwrites has a confirmation.
- The desktop update: only from the server the app is signed in to, over HTTPS, every file
  against the manifest's hashes, file names checked; `SECURITY.md` says the builds are not
  code-signed.
- `npm audit --omit=dev`: 0 vulnerabilities. Licenses of what ships: MIT, ISC, Apache-2.0, BSD,
  0BSD and Python-2.0 (argparse) — all compatible with MIT.
- A clean clone, following the README literally, with Docker: found and fixed empty optional
  values of `.env.example` (`SYNC_TOKEN=`) failing the start; then the image builds, the
  migrations run, the first user signs in, registration is closed. `npm ci` and
  `nx run-many -t lint test build` were **not** run in the clean clone (see section 5).
- Versions brought in line (`0.3.0`), `CHANGELOG.md`, the README (badges, status, the note on
  the other services), `CONTRIBUTING.md` against `CLAUDE.md`, texts of the first issues
  ([good-first-issues.md](good-first-issues.md)).

## 1. Secrets (cannot be undone)

- [x] gitleaks over the whole history — no leaks (see above)
- [x] A second scanner (trufflehog, unverified) — only the local database password
- [x] `.env.example` and `deploy/.env.example`: only placeholders
- [ ] Any token that was ever pasted into a commit, an issue, a PR or a CI log — rotate it, even
      if it was removed later
- [ ] Repository → Settings → Secrets and variables → Actions: only what the workflows need

## 2. Personal data (cannot be undone)

- [ ] **Commit e-mail.** All 219 commits carry `romanrostislavovich@gmail.com`. Decide:
  - keep it (the simplest; it is already on every public repository of yours), or
  - from now on commit with the GitHub noreply address
    (`git config user.email <id>+romanrostislavovich@users.noreply.github.com`) and turn on
    GitHub → Settings → Emails → "Block command line pushes that expose my email".
    Rewriting the old commits (`git filter-repo --mailmap`) changes every hash and needs a
    force push — not worth it unless the address must not be public
- [ ] **Issues, pull requests, discussions** of the private repository become public with it —
      read them through for personal data, screenshots with real numbers, pasted logs
- [ ] **Actions logs and artifacts** become public too — delete old workflow runs (Actions → a
      workflow → "..." → Delete) unless you are sure no log printed anything private
- [ ] **Releases** (`v0.2.0`, `v0.2.1`) and their notes — the installers are fine, check the text
- [x] **Screenshot** `docs/images/dashboard.png` — replaced on 2026-10-09 with the home page of
      a demo user ("Alex", made-up data on a throwaway instance); nothing of yours is on it
- [ ] Mentions of your own projects in code comments and tests (`ai-text-guard.com`,
      `ngx-translate-lint`) are harmless; replace them with `example.com` only if you prefer
- [ ] `docs/roadmap.md` speaks in the first person in places ("my own mixes", "my GitHub") —
      fine for a personal project, reword only if you want it to read as a product

## 3. Security of the code

Once public, anyone can read the code looking for a way in to every self-hosted instance.

- [ ] Run a full security review of the whole code base (`/security-review` in Claude Code).
      What was looked at so far: the endpoints open without a sign-in, the secrets at start,
      requests to users' addresses, raw SQL, file names of downloads, the owner-only actions,
      the assistant's tools — a full review may find more
- [x] The server refuses to start without `JWT_SECRET` and `ENCRYPTION_KEY`, with short ones or
      with the placeholders of `.env.example`; `ALLOW_REGISTRATION` is `false` by default
- [x] **Requests the server makes to addresses users give** — Monitoring, the wishlist and AI
      endpoints refuse private and local addresses once registration is open. Not covered: a
      DNS answer that changes between the check and the request (rebinding)
- [x] **Desktop auto-update** — only from the server it is signed in to, over HTTPS;
      `SECURITY.md` says the builds are not code-signed
- [x] `npm audit --omit=dev` is clean (CI checks it)
- [x] The AI tools: deleting and overwriting need a confirmation; the security agent has its
      own tools and conversation

## 4. Legal

- [x] Licenses of the dependencies are compatible with MIT — no GPL / AGPL in what ships
- [ ] Icons and images in the repository are yours or under a free license: the app icon
      (`apps/desktop/icon.png`, `apps/web/public/icon*.png`) and `docs/images/dashboard.png` are
      the only ones; there are no fonts or sounds. Only you know where the icon came from
- [x] A note in the README: not affiliated with the services it connects to
- [x] The wishlist reads shops' pages — the same note says the user follows the shop's terms

## 5. A first run that works for a stranger

- [x] **Clean clone, the Docker way** — copy `.env.example` to `.env`, set the secrets, start
      it with Docker Compose as the README says: works (one bug fixed on the way, see above)
- [ ] **Clean clone, the development way**: `npm ci`, `npx nx run-many -t lint test build`,
      `npm run dev` in a new folder — not done here: Nx's native module is blocked by Smart App
      Control on the machine this was checked on. CI does exactly this on Linux and is green;
      try it once on a computer without that block
- [ ] Do the same on Windows (the desktop tracker is Windows-only) or say so in the README
- [x] **Version**: `0.3.0` in `package.json`, the desktop's and the lock file — the next tag is
      `v0.3.0`
- [x] **CHANGELOG.md** — the entry of the public release
- [x] **README**: badges (CI, security, release, license), the status line, the links between
      the sections among the highlights
- [x] **README: a fresh screenshot** on sample data; a short GIF or more pages (a project, the
      mood, the assistant) would still help
- [x] `CONTRIBUTING.md` is up to date with `CLAUDE.md` (module boundaries, contracts, the
      client core, tables, migrations, i18n, `safeFetch`)
- [ ] Open 3–5 issues labelled `good first issue`: their texts are ready in
      [good-first-issues.md](good-first-issues.md)

## 6. GitHub settings

- [ ] About: description, website, topics (`self-hosted`, `dashboard`, `quantified-self`,
      `angular`, `nestjs`, `electron`, `personal-data`)
- [ ] Settings → Social preview: an image for links
- [ ] Settings → Security: **private vulnerability reporting** on — `SECURITY.md` and the issue
      template already link to it; Dependabot alerts on; secret scanning and **push
      protection** on (free for public repositories)
- [ ] Branch protection for `main`: CI must pass, no force pushes, no deleting
- [ ] Settings → Actions → General: "Require approval for first-time contributors" for
      workflows from forks; the default `GITHUB_TOKEN` read-only (the workflows ask for more
      where they need it)
- [ ] Labels for issues: `bug`, `enhancement`, `good first issue`, `help wanted`, `module:*`
- [ ] Discussions — on, if you want questions out of the issues

## 7. Going public

- [ ] Settings → General → Danger zone → Change visibility → Public
- [ ] The Docker image `ghcr.io/romanrostislavovich/personal-dashboard`: Packages → the
      package → Package settings → Change visibility → Public, so `docker pull` works without a
      login; check that it is linked to the repository
- [ ] A release (e.g. `v0.3.0`) with notes — the first one people will see
- [ ] Open the repository signed out (a private window): README, images, links, badges work

## 8. After

- [ ] Tell people: r/selfhosted, "Show HN", the awesome-selfhosted list (needs a demo or
      screenshots and a working Docker setup)
- [ ] Watch the first issues and the security workflow for a week
