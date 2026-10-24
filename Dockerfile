# One image for everything: NestJS API + the built Angular frontend (the API serves it as static files)
# + the code of the desktop shell and the browser extension, which installed apps update
# themselves from.
# Build and run together with the database: docker compose up -d --build
#
# Multi-platform (amd64 + arm64) without emulation: everything is built on the build machine's
# platform and only copied into the target image. The one dependency with native code — sharp,
# which makes pictures small — comes as a prebuilt package a platform, and stage 2 picks the one
# of the target image (`--cpu`, `--os`, `--libc`), so it still needs no emulation.

# --- 1. Build ---
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /repo
ENV NX_DAEMON=false NX_NO_CLOUD=true

COPY package.json package-lock.json ./
# --ignore-scripts: skip Electron and everything else that only the desktop app needs.
RUN npm ci --ignore-scripts

COPY . .
# The API build writes package.json and package-lock.json with only its own dependencies next to it.
RUN npx nx run-many -t build -p api,web,desktop,extension
# Nx leaves the root `overrides` out of that package.json, while its lock file already follows
# them (a patched multer under NestJS, see CONTRIBUTING.md): without them `npm ci` below refuses
# the lock. Entries that point at a root dependency (`$name`) mean nothing there and are skipped.
RUN node -e "const fs = require('fs'); const file = 'dist/apps/api/package.json'; \
  const api = JSON.parse(fs.readFileSync(file, 'utf8')); \
  const own = Object.entries(require('./package.json').overrides ?? {}) \
    .filter(([, value]) => !JSON.stringify(value).includes('\"\$')); \
  api.overrides = Object.fromEntries(own); \
  fs.writeFileSync(file, JSON.stringify(api, null, 2));"
# What npm knows about vulnerabilities in the packages that ship, as of this build: the
# security agent reads it (it exits non-zero when it finds any — that is not a failed build).
RUN npm audit --omit=dev --json > dist/apps/api/npm-audit.json || true

# --- 2. Production dependencies of the API ---
FROM --platform=$BUILDPLATFORM node:24-alpine AS deps
ARG TARGETARCH
WORKDIR /app
COPY --from=build /repo/dist/apps/api/package.json /repo/dist/apps/api/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --os=linux --libc=musl     --cpu="$(if [ "$TARGETARCH" = arm64 ]; then echo arm64; else echo x64; fi)"

# --- 3. Runtime ---
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    WEB_DIST_PATH=/app/web \
    DESKTOP_BUNDLE_PATH=/app/desktop-bundle \
    EXTENSION_BUNDLE_PATH=/app/extension-bundle

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /repo/dist/apps/api ./
COPY --from=build /repo/dist/apps/web/browser ./web
COPY --from=build /repo/dist/apps/desktop/bundle ./desktop-bundle
COPY --from=build /repo/dist/apps/extension ./extension-bundle

EXPOSE 3300
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.API_PORT || 3300) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "main.js"]
