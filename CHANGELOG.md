# Changelog

Notable changes of every release. The versions follow [Semantic Versioning](https://semver.org/);
before 1.0 a minor version may bring changes that need attention when updating — they are listed
under **Updating**.

## Unreleased

### Added

- **State of the connections** in Settings → Integrations: every connected service with its
  last refresh, the error of a failed one, a token that expires soon (GitHub, GitLab); a
  message once a day when a connection gets into trouble. The assistant can read it too.
- **Demo mode** (`DEMO_MODE=true`): a "Try the demo" button on the login page opens a shared
  account with made-up data in every section, made anew every night. The demo user cannot
  change the account, connect services or upload files, and no background job reaches outside.

### Updating

- Migration 0062 adds `integration_alerts`.

## 0.3.0 — the first public release

### Added

- **Links between the sections.** What one section knows is shown where another needs it, with
  the modules still independent (the core joins them):
  - a project across the sections — time at the computer, coding time, money, tasks, uptime,
    commits and releases, money per hour of work, month by month;
  - time of a computer without the tracker (WakaTime) and of games on other devices (Steam) in
    the time at the computer, without counting anything twice;
  - what goes with a good and a bad day: the numbers of every section, the weather and the
    daily rhythm against the mood of the diary;
  - the last commit before a site went down, and whether your own computers lost the server at
    the same time;
  - subscriptions against their use; a wish against its savings goal and the month's budget;
    gift ideas of the wishlist in Birthdays, and a task to buy a gift a week before;
  - the music of focus sessions; the time of a task from focus sessions and window titles;
    a limit of games that grows with the tasks done.
- **Security agent** — watches sign-ins, the server, your computers and repositories every
  hour; an AI investigates in the morning and writes a guide for each finding.
- **Export and import** of everything you keep, as a ZIP with readable files.
- **Wishlist** with prices read from the shops' pages every day.
- **Days of memory** next to birthdays.
- **Repositories** of GitHub, GitLab and Bitbucket in one tab, private ones too.
- The assistant: a tool for every link, links to the pages of the app in its answers, search in
  your own history.
- More than 360 achievements, some for what the sections know together.

### Security

- The server refuses to start with the placeholder secrets of `.env.example`.
- Requests to addresses users give (a monitored site, a shop's page, an AI endpoint) do not go
  to private and local addresses once registration is open (`ALLOW_PRIVATE_URLS`).
- PostgreSQL of the local `docker-compose.yml` listens on this computer only.
- The assistant asks before it replaces text in the diary, as it does before deleting.

### Updating

- With `ALLOW_REGISTRATION=true`, monitors and AI connections that point to a private address
  (a NAS at `192.168.*`, Ollama on `localhost`) stop working until `ALLOW_PRIVATE_URLS=true` is
  set. A personal instance (registration closed) is not affected.
- A database of the local `docker-compose.yml` reached from another computer of your network
  needs its port published again by hand.

## 0.2.1 and earlier

Before the repository was public; see the
[releases](https://github.com/romanrostislavovich/personal-dashboard/releases).
