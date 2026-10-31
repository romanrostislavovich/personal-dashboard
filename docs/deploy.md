# Deploy to a server

The server runs the dashboard around the clock: access from anywhere, the Telegram bot and
background jobs. Your computer keeps its own copy and syncs with it ([sync.md](sync.md)).

What runs on the server (`deploy/compose.yml`):

| Service  | What it does                                                                         |
| -------- | ------------------------------------------------------------------------------------ |
| `caddy`  | HTTPS with automatic Let's Encrypt certificates, the only thing open to the internet |
| `app`    | the dashboard image from GitHub Container Registry                                   |
| `db`     | PostgreSQL, not reachable from outside                                               |
| `backup` | a database dump once a day into `./backups` (14 days kept), a test restore weekly    |

The image is built by GitHub Actions (`.github/workflows/image.yml`) for amd64 and arm64:
every push to `main` publishes the tag `main`, a tag `v0.2.0` publishes `0.2.0` and `latest`.

## 1. Server

A Hetzner Cloud server with 2 vCPU and 4 GB RAM is plenty (x86 CX or ARM CAX — both work),
Ubuntu 24.04, a location close to you (Falkenstein / Nuremberg for Central Europe).

- Add your **SSH key** when creating it (password login is then disabled).
- Enable **Backups** (daily snapshots of the whole server).
- Create a **Firewall**: inbound TCP 22, 80, 443 and UDP 443; attach it to the server.

Besides the app and the database the server runs **LanguageTool** (the spelling and grammar of
Writing): its Java is capped at 768 MB, so with 4 GB there is room enough; on a 2 GB server take
the `languagetool` service out of `compose.yml` — only the AI rewrites of Writing stay.

Keep the dashboard off the servers of the sites it monitors: if they share a machine, you learn
nothing when that machine goes down.

## 2. Domain

Create a DNS record for the dashboard, for example `dash.example.com`: type `A` → the server's
IPv4 (and `AAAA` → IPv6). Caddy needs it to get a certificate.

## Quick way: `deploy/deploy.sh`

From your computer, with SSH access to the server by key:

```bash
cp deploy/deploy.local.env.example deploy/deploy.local.env   # server address, domain, SSH key
deploy/deploy.sh --with-data   # the first time: also copies your local database
deploy/deploy.sh               # every update
deploy/deploy.sh --local       # an update with the image built here
```

The image is the one CI built for the commit (`sha-<commit>` in GitHub Container Registry, a public
package): the server pulls it itself, nothing big goes over your connection. A commit just pushed
waits for CI (up to `CI_WAIT_MINUTES`, 25 by default) and a failed CI is not waited out. Without an
image of CI — uncommitted changes, a commit not on `origin/main`, a failed CI, an arm64 server, or
`--local` — the image is built here and uploaded over SSH (about 440 MB). At the end the script trims
Docker on this computer: the build cache not used for 3 days (all of it once it is over 20 GB), and the images of older deploys but
the last two. Docker Desktop's disk file (`docker_data.vhdx`) does not shrink by itself: after a
big cleanup, quit Docker Desktop, run `wsl --shutdown` and compact the file (`Optimize-VHD`, or
`diskpart` → `select vdisk file=…` → `compact vdisk`). The script also installs
Docker on the first run, writes the server's `.env` from yours (the same `ENCRYPTION_KEY` and
integration tokens, new secrets for the rest), switches your computer to a sync client of the server
(the old `.env` is kept as `.env.before-sync`) and starts everything. Steps 3–6 below are the same
done by hand, with the image from GitHub Container Registry.

Updating with the script: `deploy/deploy.sh` on the server, then restart the local instance —
both then run the same version.

## 3. Docker and the files

```bash
ssh root@<server-ip>
curl -fsSL https://get.docker.com | sh
mkdir -p /opt/dashboard
```

From your computer, copy the deploy files:

```bash
scp deploy/compose.yml deploy/Caddyfile deploy/backup.sh deploy/.env.example root@<server-ip>:/opt/dashboard/
```

The image is a public package: no login. For a fork whose package is private, log in to the
registry once with a [token](https://github.com/settings/tokens) (classic) with only the
`read:packages` scope:

```bash
docker login ghcr.io -u <github-user>   # password: the token
```

## 4. Settings

```bash
cd /opt/dashboard
cp .env.example .env
nano .env
```

- `DOMAIN` — the domain from step 2.
- `DB_PASSWORD`, `JWT_SECRET` — new random values (`openssl rand -hex 32`).
- `ENCRYPTION_KEY` — **the same as in your computer's `.env`**.
- `SYNC_TOKEN` — a new random value; the same goes into your computer's `.env`.

The Telegram bot, the Spotify app and LanguageTool are not in `.env`: they are set in
Settings → Integrations and arrive on the server with the first sync.

## 5. Start

```bash
docker compose up -d
docker compose ps          # app becomes "healthy" in about a minute
docker compose logs -f app
```

Open `https://<DOMAIN>/api/health` — it answers `{"status":"ok"}`. The database is empty for now:
your user and data arrive with the first sync.

## 6. Connect your computer

In the computer's `.env` (see [sync.md](sync.md)):

```
SYNC_MODE=client
SYNC_TOKEN=<the same token>
SYNC_SERVER_URL=https://<DOMAIN>
```

The local instance must keep running to sync: `docker compose up -d --build` in the repository
runs it in the background (on :3300; point the desktop app there). A client only sends
Telegram notifications; the bot answers from the server.

Restart it; within a minute **Settings → Sync** on the computer shows the first sync, and you
can log in at `https://<DOMAIN>` with the same email and password. Then connect Telegram in the
server's settings.

## Local models on the server (optional)

[Ollama](https://ollama.com) next to the app keeps the AI's small jobs on your server. Add to
`.env`:

```
COMPOSE_PROFILES=ollama
OLLAMA_MODELS=paraphrase-multilingual   # the models pulled on start, separated by spaces
OLLAMA_MEMORY=1g                   # what the container may use
```

and run `docker compose up -d` (or `deploy/deploy.sh`). Then in **Settings → AI** add a
connection of the kind "Ollama" with the address `http://ollama:11434/v1`.

What fits: `paraphrase-multilingual` (562 MB) — the model of search by meaning, Russian and
English alike — runs on the smallest server (`nomic-embed-text` is smaller but knows only
English). A chat model good enough for light background work is bigger: `qwen2.5:7b` passes the
evals (`npm run ai:eval`), `qwen2.5:3b` and `1.5b` do not; the 7B model needs about 6 GB of free
memory (`OLLAMA_MEMORY=6g`), so a server with 8 GB.

## Updating

Both instances must run the same version (the same migrations); until they do, sync pauses with a
clear message and nothing is lost. `deploy/deploy.sh` updates both: right after the server it
runs this computer's instance on the very same image (when one runs here).

By hand:

1. Push to `main` and wait for the **Image** workflow.
2. Server: `cd /opt/dashboard && docker compose pull && docker compose up -d`
3. Computer: `git pull && docker compose up -d --build`

Migrations are applied automatically on start. To pin a version instead of following `main`, set
`IMAGE_TAG=0.2.0` in the server's `.env`.

The installed apps follow the server by themselves: the desktop app and the browser extension
fetch their code from it (`/desktop-updates`, `/extension-updates`), see Settings → Apps.

`deploy/deploy.sh` also puts the desktop installers for Windows and Linux on the server
(`downloads/desktop`, served at `/downloads/desktop` for Settings → Apps). They are built in
Docker (`deploy/desktop-installers.Dockerfile`, with Wine — an x86-64 computer) only when what
they are made of changes: Electron, the loader, the icon or the version — rarely, they are about
250 MB, and the code inside updates itself anyway. Without them (an image from GHCR) Settings →
Apps links to GitHub Releases; macOS is always there, a `.dmg` is built only on a Mac.

The Android app (`downloads/mobile`) is built the same way, only when its native part changes
(`deploy/mobile-apk.Dockerfile`): the interface inside is copied from the server image of the same
commit instead of being built again, and npm and Gradle keep their downloads in BuildKit caches,
so a rebuild takes a few minutes instead of about ten.

## Backups

- `./backups/dashboard-YYYY-MM-DD.dump` on the server, daily, 14 days (`BACKUP_KEEP_DAYS`).
- **A test restore every week:** the backup job restores the fresh dump into a scratch database
  and compares the row count of every table with the live one (`backups/restore-check.json`).
- **A copy on your computer:** the sync client downloads the newest dump every day into
  `BACKUP_COPY_DIR` (`backups/` next to the local instance; with `docker compose` — `./backups`
  of the repository) and keeps the last 14 (`BACKUP_COPY_KEEP`). It survives losing the server.
  The dumps hold your data unencrypted except integration tokens — keep that folder private.
- The dashboard watches all this: a missing or old dump, a failed test restore or a copy several
  days old go to Telegram, and **Settings → Sync** shows the latest dump, copy and check.
- Hetzner Backups: snapshots of the whole server.
- Your computer: a full, constantly synced copy of the data.

Restore a dump (it replaces the current database):

```bash
cd /opt/dashboard
docker compose stop app
docker compose exec db dropdb -U dashboard dashboard
docker compose exec db createdb -U dashboard dashboard
docker compose exec -T db pg_restore -U dashboard -d dashboard --no-owner < backups/dashboard-2026-09-27.dump
# The dump is older than your computer's data: make the computer send everything again.
docker compose exec db psql -U dashboard -c "DELETE FROM sync.state WHERE key = 'server-id'"
docker compose start app
```

Without the last `psql` line the computer would not notice the restore and would not send back
what changed after the dump.

## The security agent on the server

The dashboard runs in a container and cannot see the host. `deploy.sh` therefore uploads
`deploy/security-scan.sh` and installs `/etc/cron.d/dashboard-security`: every hour, as root, the
script reads the SSH settings and sign-ins, the firewall, the listening ports and the pending
updates and writes `security/host.json`, which the Security section shows. It only reads — it
changes nothing on the server. To look at the report: `bash /opt/dashboard/security-scan.sh -`.
To stop it: `rm /etc/cron.d/dashboard-security`.

A firewall of the hosting (Hetzner Cloud Firewall) is outside the server and not visible to the
script: with one in place, mark the "no firewall" finding as known.

## Hardening the server

What the security agent asks for, as it was done on personal-world.com (2026-10-26). Check that
you can sign in **with a key** before switching passwords off, and keep the hosting's console
(Hetzner: Console in the server's menu) as a way back.

SSH — keys only, root too (`deploy.sh` signs in as root with a key). sshd takes the first value it
reads, so the file goes before `50-cloud-init.conf`, which turns passwords on. Save as
`/etc/ssh/sshd_config.d/00-hardening.conf`:

```
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
```

Then `sshd -t && systemctl reload ssh`, and from another terminal: `ssh root@<server> true` still
gets in, `ssh -o PubkeyAuthentication=no root@<server> true` answers "Permission denied
(publickey)".

Firewall — SSH, HTTP, HTTPS and HTTP/3 in, everything else closed (Docker's published ports, 80 and
443 of Caddy, keep working: Docker manages its own rules):

```bash
ufw default deny incoming && ufw default allow outgoing
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw --force enable
```

fail2ban — bots guessing passwords are banned for an hour, longer each time they return:
`apt-get install -y fail2ban`, then `/etc/fail2ban/jail.d/sshd.local`:

```
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
bantime.increment = true
bantime.maxtime = 1w
```

and `systemctl restart fail2ban`.

Updates — `apt-get update && apt-get -y full-upgrade`, then `systemctl reboot` when
`/var/run/reboot-required` exists (the containers come back by themselves). Ubuntu installs
security updates on its own (unattended-upgrades); the agent says when a restart is due.

## Rolling back

Before every update `deploy/deploy.sh` keeps the running image and a dump of the database
(`backups/pre-deploy-*.dump`, the last three). If an update goes wrong:

```bash
deploy/deploy.sh --rollback
```

It starts the previous image again. If the update applied migrations, it first restores the
database from before the update — what was written on the server after it is lost, and your
computer sends its own changes again. Then run the same version on the computer (the script
prints which): until both match, sync waits.

If the restore itself fails, the app stays stopped: restore a daily dump by hand as above.
