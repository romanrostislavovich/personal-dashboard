---
name: deploy
description: Deploy the dashboard to the owner's server (https://personal-world.com) safely — merge, the same checks CI runs, deploy.sh, the APK over the cable, the local instance. Use when the owner says "задеплой", "deploy", "выкати", or asks to commit+merge+deploy.
---

# Deploy

The owner deploys from this computer with `deploy/deploy.sh` (docs/deploy.md). Deploy only on the
owner's explicit request for this change. Answer the owner in Russian.

## 1. Before: the branch reaches main cleanly

1. `git status` — only the intended files; never stage `.junie/`.
2. `git fetch -q && git log --oneline main..origin/main` — commits made elsewhere (another session,
   the owner's laptop) must be merged in **before** deploying, or the deploy rolls them back.
3. Commit on a branch (`feat/…`, `fix/…`), `git merge --no-ff` into `main`, `git push origin main`.

## 2. The checks CI runs (do not skip — CI failed twice on what a local run missed)

Run them per project, **from the project's folder**, so its own eslint config (Angular templates
included) applies:

- Lint: `cd <project> && npx eslint .` for every project the change touches (the commit hook only
  covers ≤150 staged code files).
- Types: `npx tsc -p <lib>/tsconfig.lib.json --noEmit --declaration false --declarationMap false`;
  web libraries: `npx ngc -p <lib>/tsconfig.lib.json --noEmit` (templates).
- Tests with the database, on a **scratch DB** (never 5433/dashboard — the owner's live sync-client
  DB): `docker exec personal-dashboard-db-1 sh -c "dropdb -U dashboard --if-exists pd_test; createdb -U dashboard pd_test"`,
  then `cd <project> && TEST_DATABASE_URL=postgres://dashboard:dashboard@localhost:5433/pd_test npx vitest run --fileParallelism=false`.
- A new table read in `onModuleInit`, or a migration: boot the image on a scratch DB first
  (see the `verify-ui` skill) — a crash there once took production down.

Nx may be blocked locally by Smart App Control: do not run `nx reset`; run the tools directly as above.

## 3. Deploy

- `rmdir dist/.deploy.lock 2>/dev/null` only after checking no deploy runs
  (`Get-CimInstance Win32_Process` for `deploy.sh` / `docker-buildx`) — a killed deploy leaves it.
- Run in the background: `deploy/deploy.sh` (takes the image CI built for this commit; it waits up to
  25 min for it) or `deploy/deploy.sh --local` when CI is red or slow (builds here). Docker Desktop
  must be running.
- If a run must be stopped: stop the task, then kill leftover `deploy.sh` / `docker-buildx`
  processes — killing the shell does not stop them.

## 4. After

- CI of the pushed commit: `gh run list --branch main --limit 3` (gh is installed:
  `C:\Program Files\GitHub CLI\gh.exe`); a red run → `gh run view <id> --log-failed`, fix, push.
- Native Android changed (`apps/mobile/android`, Capacitor plugins): the deploy builds an APK into
  `dist/server-apk/personal-dashboard.apk`; install it over the cable with the `phone` skill.
- The owner's local instance is a sync client and must run the same migrations: deploy.sh updates
  it itself ("Updating this computer's sync client"); if it printed that it did not, run
  `docker compose up -d --build app`.
- Report: the commit on the server, the rollback point the log printed, what was not verified live.
