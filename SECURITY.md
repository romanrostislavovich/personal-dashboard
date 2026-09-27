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
  — integration tokens cannot be decrypted without it.
- Serve the dashboard over HTTPS (a reverse proxy such as Caddy or Traefik).
- Keep `ALLOW_REGISTRATION=false` unless you really want other people to sign up.
- Do not expose PostgreSQL to the internet.
- The AI assistant sends the data needed for an answer to the configured provider. Use a local model
  (Ollama) if that is not acceptable.
