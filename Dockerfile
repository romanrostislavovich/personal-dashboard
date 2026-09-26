# Один образ на всё: NestJS API + собранный Angular-фронтенд (API раздаёт его как статику).
# Сборка и запуск вместе с базой: docker compose up -d --build

# --- 1. Сборка ---
FROM node:24-alpine AS build
WORKDIR /repo
ENV NX_DAEMON=false NX_NO_CLOUD=true

COPY package.json package-lock.json ./
# --ignore-scripts: не качаем Electron и прочее, что нужно только для desktop.
RUN npm ci --ignore-scripts

COPY . .
# Сборка API кладёт рядом package.json и package-lock.json только с его зависимостями.
RUN npx nx run-many -t build -p api,web

# --- 2. Рантайм ---
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
