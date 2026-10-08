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

## 1. Secrets (cannot be undone)

- [ ] Run gitleaks locally over the whole history, not only in CI:
      `brew install gitleaks && gitleaks git . --verbose` — every finding is either fixed or a
      reasoned line in `.gitleaksignore`
- [ ] A second scanner for what gitleaks misses: `brew install trufflehog && trufflehog git file://. --only-verified`
- [ ] Check `.env.example` and `deploy/.env.example` by hand: only placeholders, no real
      values left from your own setup
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
- [ ] **Screenshot** `docs/images/dashboard.png` is outdated (September, 42 achievements, an old
      menu) and shows your account; replace it with fresh screenshots on sample data (see
      "Demo mode" in the roadmap, or a separate user filled by hand)
- [ ] Mentions of your own projects in code comments and tests (`ai-text-guard.com`,
      `ngx-translate-lint`) are harmless; replace them with `example.com` only if you prefer
- [ ] `docs/roadmap.md` speaks in the first person in places ("my own mixes", "my GitHub") —
      fine for a personal project, reword only if you want it to read as a product

## 3. Security of the code

Once public, anyone can read the code looking for a way in to every self-hosted instance.

- [ ] Run a security review of the whole code base (`/security-review` in Claude Code), fix
      what it finds
- [ ] The server refuses to start without `JWT_SECRET` and `ENCRYPTION_KEY`, or with short
      ones; `ALLOW_REGISTRATION` is `false` by default
- [ ] **Requests the server makes to addresses users give** — Monitoring checks, the wishlist
      reading a shop's page, integration URLs (self-hosted GitLab...): block private and local
      addresses (`127.0.0.1`, `10.*`, `192.168.*`, `169.254.169.254`, `localhost`) at least when
      registration is open, otherwise a user can reach the server's internal network (SSRF)
- [ ] **Desktop auto-update** — the app updates itself from the server; make sure it only
      accepts an update from the server it is signed in to over HTTPS, and write down in
      `SECURITY.md` that the builds are not code-signed
- [ ] `npm audit --omit=dev` is clean (CI checks it)
- [ ] The AI tools: deleting still needs a confirmation; data from integrations (diary text,
      e-mails, page titles) cannot switch the security agent off (it already has its own tools)

## 4. Legal

- [ ] Licenses of the dependencies are compatible with MIT:
      `npx license-checker-rseidelsohn --production --summary` — no GPL / AGPL in what ships
- [ ] Icons, fonts, sounds and images in the repository are yours or under a free license
- [ ] A short note in the README: not affiliated with Valve, Blizzard, Spotify, Last.fm,
      GitHub and the others; their names and APIs belong to them
- [ ] The wishlist reads shops' pages — a note that the user is responsible for following the
      shop's terms

## 5. A first run that works for a stranger

- [ ] **Clean clone**: clone into a new folder (no `node_modules`, no `.env`) and follow the
      README literally: `npm ci`, `npx nx run-many -t lint test build`, then the self-hosting
      steps with `docker compose up`; fix every step that needs knowledge not written down
- [ ] Do the same on Windows (the desktop tracker is Windows-only) or say so in the README
- [ ] **Version**: `package.json` says `0.1.0`, the latest tag is `v0.2.1` — bring them in line
- [ ] **CHANGELOG.md** — at least one entry for the public release
- [ ] **README**: fresh screenshots or a short GIF; badges (CI, license, latest release); the
      feature list matches what is in `docs/roadmap.md` under ✅; a line about the status
      ("a personal project, used daily; breaking changes are possible before 1.0")
- [ ] `CONTRIBUTING.md` is up to date with `CLAUDE.md` (module boundaries, contracts,
      migrations, i18n keys in both languages)
- [ ] 3–5 issues labelled `good first issue` (e.g. a translation, a small integration)

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
