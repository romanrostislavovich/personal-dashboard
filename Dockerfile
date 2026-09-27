# One image for everything: NestJS API + the built Angular frontend (the API serves it as static files).
# Build and run together with the database: docker compose up -d --build

# --- 1. Build ---
FROM node:24-alpine AS build
WORKDIR /repo
ENV NX_DAEMON=false NX_NO_CLOUD=true

COPY package.json package-lock.json ./
# --ignore-scripts: skip Electron and everything else that only the desktop app needs.
RUN npm ci --ignore-scripts

COPY . .
# The API build writes package.json and package-lock.json with only its own dependencies next to it.
RUN npx nx run-many -t build -p api,web

# --- 2. Runtime ---
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    WEB_DIST_PATH=/app/web

COPY --from=build /repo/dist/apps/api/package.json /repo/dist/apps/api/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /repo/dist/apps/api ./
COPY --from=build /repo/dist/apps/web/browser ./web

EXPOSE 3300
USER node
CMD ["node", "main.js"]
