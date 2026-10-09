# Security Policy

Personal Dashboard stores personal data and API tokens, so security reports are taken seriously.

## Reporting a vulnerability

**Please do not open a public issue.** Report it privately via
[GitHub security advisories](../../security/advisories/new). Include steps to reproduce, the affected
version and the impact you expect. You should receive a response within a week.

## Supported versions

Security fixes are released for the latest version only.

## Self-hosting checklist

- Use long random values for `JWT_SECRET` and `ENCRYPTION_KEY`, and keep a backup of `ENCRYPTION_KEY`
  — integration tokens cannot be decrypted without it. The server refuses to start with the
  placeholders of `.env.example`.
- Serve the dashboard over HTTPS (a reverse proxy such as Caddy or Traefik).
- Keep `ALLOW_REGISTRATION=false` unless you really want other people to sign up. Every user of
  an instance can make the server request addresses: a site to monitor, a shop's page, an AI
  endpoint. Once registration is open these requests are refused for private and local
  addresses (`127.0.0.1`, `10.*`, `192.168.*`, cloud metadata), so nobody reaches the server's
  own network through them; `ALLOW_PRIVATE_URLS=true` turns that off — do not set it on an
  instance with users you do not trust. The check resolves a name before the request and does
  not pin the address for it (DNS rebinding is not covered).
- Do not expose PostgreSQL to the internet.
- The AI assistant sends the data needed for an answer to the configured provider. Use a local model
  (Ollama) if that is not acceptable.

## Desktop app

- The installers are **not code-signed**: Windows SmartScreen and macOS Gatekeeper warn about
  them, and Windows Smart App Control may block the installer. Check the file against the
  release it came from, or build it yourself (`docs/desktop.md`).
- The app updates its own code from the server it is signed in to, and only from it: over
  HTTPS (a local instance on this computer is the one exception), every file checked against
  the hashes of the manifest. Whoever controls that server controls the code the app runs —
  connect it only to a server you trust.
