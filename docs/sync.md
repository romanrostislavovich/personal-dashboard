# Sync: your computer + a server

Run the dashboard on your computer and keep a copy on a server: everything works locally (also
offline), and the server gives you access from anywhere and runs the Telegram bot. The two databases
sync with each other in both directions.

```
 your computer (SYNC_MODE=client)                 server (SYNC_MODE=server)
 ┌──────────────────────────────┐   every minute  ┌─────────────────────────────────┐
 │ dashboard + PostgreSQL       │ ── pull, push ─▶│ dashboard + PostgreSQL          │
 │ works offline                │                 │ Telegram bot, background jobs   │
 └──────────────────────────────┘                 └─────────────────────────────────┘
```

- The **client** starts every sync (so the computer needs no public address): it pulls the server's
  changes, then pushes its own. Without a connection it keeps working and retries later.
- The **server** runs the Telegram bot and all background jobs (reminders, recurring payments,
  imports, monitoring, achievements). The client runs none of them — otherwise payments would be
  charged and messages sent twice; their results arrive with the sync.

## Setup

Both instances need the same **`ENCRYPTION_KEY`** (integration tokens are synced encrypted) and the
same version of the dashboard. `JWT_SECRET` may differ — you just log in on each one separately
with the same email and password.

1. Generate a sync token (at least 32 characters) on any machine:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. **Server** `.env`:
   ```
   SYNC_MODE=server
   SYNC_TOKEN=<the token>
   ENCRYPTION_KEY=<the same as on your computer>
   TELEGRAM_BOT_TOKEN=<your bot>
   ```
   Start it with an **empty database** and without `ADMIN_EMAIL`: your user and all data arrive
   with the first sync. (In sync mode the first user is never created automatically: two users
   with the same email and different ids cannot be merged.)
   Setting up the server itself: [deploy.md](deploy.md).
3. **Computer** `.env`:
   ```
   SYNC_MODE=client
   SYNC_TOKEN=<the same token>
   SYNC_SERVER_URL=https://dash.example.com
   # optional
   SYNC_INTERVAL_SECONDS=60
   SYNC_PEER_NAME=home-pc
   ```
   `TELEGRAM_BOT_TOKEN` may stay set: the client only sends notifications, and the bot answers
   from the server. Connect Telegram (the "Connect" button in settings) on the server.
4. Restart both. **Settings → Sync** shows the state; "Sync now" runs it right away.

The server must be reachable over HTTPS: the token and your data travel in these requests.

## How it works

- A trigger on every table in the `public` schema logs changed rows into `sync.row_versions`
  (table, primary key, time of the change). Module tables need nothing extra — a new table is
  tracked on the next start. Rows that existed before sync was turned on are sent too.
- A sync sends the current version of every changed row (or "deleted"). Requests are gzipped JSON
  on `POST /api/sync/pull` and `POST /api/sync/push`, authorized by `SYNC_TOKEN`.
- Only committed transactions are read, in commit order, so no change is skipped.
- Changes are applied in foreign key order. A change that references a row that has not arrived
  yet waits in `sync.parked` and is retried after every sync.

### Conflicts

The **newer change wins** — per row, by the time of the change. The losing version is not
discarded: it is kept in `sync.conflicts` (the settings page shows how many there are), for example:

- the same diary entry edited on the computer offline and from Telegram — the later edit stays;
- a diary entry for the same day written on both sides before they synced — the later one stays.

To look at them: `SELECT table_name, row, reason, created_at FROM sync.conflicts ORDER BY created_at DESC;`

The clocks of both machines should be right (NTP): "newer" is decided by the time of the change.

### When something goes wrong

- **"The instances run different versions"** — update both to the same version (migrations must match).
- **"ENCRYPTION_KEY differs"** — set the same key on both.
- **"The server rejected SYNC_TOKEN"** — the token must be the same on both.
- **The server database was replaced** — the client notices, downloads everything and sends all of
  its data again. After restoring the server from a dump, delete its id so the client does the
  same: `DELETE FROM sync.state WHERE key = 'server-id';` (see [deploy.md](deploy.md)).
- **Changes waiting for related data** stay in `sync.parked` with the error; usually they resolve
  themselves after the next sync.
