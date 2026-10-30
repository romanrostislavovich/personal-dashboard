---
name: verify-ui
description: See a change working in the real app without touching the owner's data — build the image, boot it on a scratch database, seed data, open pages in Chrome at desktop and phone width, read the console. Use after UI or API changes and before a deploy that adds tables.
---

# Verify in the real app

Never use the owner's DB `5433/dashboard` (their live sync-client data) for throwaway servers.

1. Build: `docker buildx build -t pd-check:local --load .` (background; Nx builds api and web
   inside — a build error here is a real one).
2. Scratch DB and server:
   ```
   docker exec personal-dashboard-db-1 sh -c "dropdb -U dashboard --if-exists pd_ui; createdb -U dashboard pd_ui"
   docker run -d --name pd-check --network personal-dashboard_default -p 3399:3300 \
     -e DATABASE_URL=postgres://dashboard:dashboard@db:5432/pd_ui -e API_PORT=3300 \
     -e JWT_SECRET=$(openssl rand -hex 32) -e ENCRYPTION_KEY=$(openssl rand -hex 32) \
     -e ADMIN_EMAIL=check@ui.test -e ADMIN_PASSWORD=Check-ui-2026 \
     -e PUBLIC_URL=http://localhost:3399 -e SYNC_MODE=off -e TELEGRAM_BOT_TOKEN= pd-check:local
   ```
   Wait for "Nest application successfully started" in `docker logs pd-check` — migrations applied.
3. Seed through the API (sign in with `POST /api/auth/login`, a device with
   `POST /api/activity/devices` for device uploads) with a script in the scratchpad.
   Delete any `ai_connections` copied from real data before testing AI paths.
4. Chrome (load the claude-in-chrome tools in one ToolSearch): new tab → `http://localhost:3399/login`;
   unregister old service workers and caches first
   (`navigator.serviceWorker.getRegistrations()`, `caches.keys()`), sign in with `fetch` (typed
   input does not reach the Angular form), then navigate.
5. Look at desktop **and phone width** (`resize_window` to ≈390×844): tabs (first tap switches),
   grids, dialogs. Screenshots may time out here — fall back to `get_page_text`/`find`.
6. `read_console_messages` with `onlyErrors: true`.
7. Clean up: close the tab, `docker rm -f pd-check`, `dropdb pd_ui`, `docker rmi pd-check:local`.
