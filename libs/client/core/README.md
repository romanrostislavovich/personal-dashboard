# client-core

The core every client of the dashboard shares — the web app today, the desktop shell through it,
a mobile app later. Plain TypeScript without a UI framework:

- `Session` — the access token, kept in the platform's storage;
- `ApiClient` — requests to the dashboard API: server address, token, JSON, errors;
- `authApi`, `projectsApi`, `API_PATHS` — typed requests of the core;
- `RealtimeConnection` — live events (Server-Sent Events) with reconnects;
- `resolveLocale` — the UI language.

A platform plugs in through `ClientPlatform`: the server address, `fetch` and a key-value store
(`localStorage` in a browser, a secure store on a phone). See `createDashboardClient`.
