# One image for everything: NestJS API + the built Angular frontend (the API serves it as static files)
# + the code of the desktop shell, which installed desktop apps update themselves from.
# Build and run together with the database: docker compose up -d --build
#
# Multi-platform (amd64 + arm64) without emulation: everything is built on the build machine's
# platform and only copied into the target image. This works because all runtime dependencies
# of the API are pure JavaScript — a dependency with native code would need `npm ci` in stage 3.

# --- 1. Build ---
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /repo
ENV NX_DAEMON=false NX_NO_CLOUD=true

COPY package.json package-lock.json ./
# --ignore-scripts: skip Electron and everything else that only the desktop app needs.
RUN npm ci --ignore-scripts

COPY . .
# The API build writes package.json and package-lock.json with only its own dependencies next to it.
RUN npx nx run-many -t build -p api,web,desktop

# --- 2. Production dependencies of the API ---
FROM --platform=$BUILDPLATFORM node:24-alpine AS deps
WORKDIR /app
COPY --from=build /repo/dist/apps/api/package.json /repo/dist/apps/api/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# --- 3. Runtime ---
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    WEB_DIST_PATH=/app/web \
    DESKTOP_BUNDLE_PATH=/app/desktop-bundle

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /repo/dist/apps/api ./
COPY --from=build /repo/dist/apps/web/browser ./web
COPY --from=build /repo/dist/apps/desktop/bundle ./desktop-bundle

EXPOSE 3300
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.API_PORT || 3300) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "main.js"]
