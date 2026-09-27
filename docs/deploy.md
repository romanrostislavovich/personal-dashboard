# Deploy to a server

The server runs the dashboard around the clock: access from anywhere, the Telegram bot and
background jobs. Your computer keeps its own copy and syncs with it ([sync.md](sync.md)).

What runs on the server (`deploy/compose.yml`):

| Service  | What it does                                                                         |
| -------- | ------------------------------------------------------------------------------------ |
| `caddy`  | HTTPS with automatic Let's Encrypt certificates, the only thing open to the internet |
| `app`    | the dashboard image from GitHub Container Registry                                   |
| `db`     | PostgreSQL, not reachable from outside                                               |
| `backup` | a database dump once a day into `./backups`, the last 14 days are kept               |

The image is built by GitHub Actions (`.github/workflows/image.yml`) for amd64 and arm64:
every push to `main` publishes the tag `main`, a tag `v0.2.0` publishes `0.2.0` and `latest`.

## 1. Server

A Hetzner Cloud server with 2 vCPU and 4 GB RAM is plenty (x86 CX or ARM CAX — both work),
Ubuntu 24.04, a location close to you (Falkenstein / Nuremberg for Central Europe).

- Add your **SSH key** when creating it (password login is then disabled).
- Enable **Backups** (daily snapshots of the whole server).
- Create a **Firewall**: inbound TCP 22, 80, 443 and UDP 443; attach it to the server.

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
```

It builds the image here and uploads it over SSH (no registry, no token on the server), installs
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

The repository is private, so the image is too: log in to the registry once. Create a
[token](https://github.com/settings/tokens) (classic) with only the `read:packages` scope:

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
- `TELEGRAM_BOT_TOKEN` — the bot now lives here.

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
runs it in the background (on :3300; point the desktop app there). The computer may keep
`TELEGRAM_BOT_TOKEN`: a client only sends notifications, the bot answers from the server.

Restart it; within a minute **Settings → Sync** on the computer shows the first sync, and you
can log in at `https://<DOMAIN>` with the same email and password. Then connect Telegram in the
server's settings.

## Updating

Both instances must run the same version (the same migrations); until they do, sync pauses with a
clear message and nothing is lost.

1. Push to `main` and wait for the **Image** workflow.
2. Server: `cd /opt/dashboard && docker compose pull && docker compose up -d`
3. Computer: `git pull && docker compose up -d --build`

Migrations are applied automatically on start. To pin a version instead of following `main`, set
`IMAGE_TAG=0.2.0` in the server's `.env`.

## Backups

- `./backups/dashboard-YYYY-MM-DD.dump` on the server, daily, 14 days (`BACKUP_KEEP_DAYS`).
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
