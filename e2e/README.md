# End-to-end smoke tests

A few clicks through the real app in a browser — what unit tests cannot see: that the built
image starts, the pages load and the main paths work end to end.

| Test      | What it does                                                                      |
| --------- | --------------------------------------------------------------------------------- |
| `sign-in` | a wrong password is refused; signing in opens the dashboard and the session holds |
| `diary`   | an entry typed in the editor is saved and is there after a reload                 |
| `finance` | an expense added through the form shows among the transactions                    |
| `ai`      | a message to the assistant gets the answer of a fake model (`fake-ai.mjs`)        |

Every test makes an account of its own, so they run side by side. The AI is `fake-ai.mjs`,
started by Playwright: no key, no network, the same answer every time.

## In CI

The `e2e` job of `.github/workflows/ci.yml` builds the Docker image, runs it on the runner's
network next to PostgreSQL and runs the tests in Chromium. A failure keeps the report and the
server's log as the `e2e-report` artifact. The image is published only after this passes too.

## Locally

Any instance with registration open, private addresses allowed (for the fake model) and the
rate limits off (a test makes an account each):

```bash
docker run -d --name pd-e2e -p 3399:3300 --add-host host.docker.internal:host-gateway \
  -e DATABASE_URL=postgres://… -e JWT_SECRET=… -e ENCRYPTION_KEY=… \
  -e ALLOW_REGISTRATION=true -e ALLOW_PRIVATE_URLS=true -e RATE_LIMITS=false \
  personal-dashboard
E2E_URL=http://localhost:3399 E2E_CHROME=1 npm run e2e
```

`E2E_CHROME=1` uses the Chrome installed on the computer instead of Playwright's own Chromium
(`npx playwright install chromium`). From a container on Docker Desktop the fake model is at
`host.docker.internal` — the default of `E2E_AI_URL`.

Never point the tests at an instance with real data: they make accounts in it.
