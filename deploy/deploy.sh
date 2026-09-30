#!/usr/bin/env bash
# Deploys the dashboard from this computer to your server (docs/deploy.md).
#
#   deploy/deploy.sh               build, upload and restart (every update)
#   deploy/deploy.sh --with-data   the first time: also copy the local database to the server
#   deploy/deploy.sh --rollback    back to the previous version (and its database, if the
#                                  update changed the schema)
#
# Before every update the server keeps the previous image and a dump of the database
# (backups/pre-deploy-*.dump) — that is what --rollback goes back to.
# The image is built here and uploaded over SSH — no registry login on the server.
# Settings: deploy/deploy.local.env (not committed), see deploy/deploy.local.env.example.
#
# The first run also prepares the server (installs Docker, writes its .env from yours:
# the same ENCRYPTION_KEY and integration tokens, new secrets for the rest) and switches this
# computer to a sync client of the server (docs/sync.md). Secrets are never printed.
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash on Windows: keep /opt/... as it is

cd "$(dirname "$0")/.."
# shellcheck source=/dev/null
[ -f deploy/deploy.local.env ] && . deploy/deploy.local.env
: "${DEPLOY_HOST:?Set DEPLOY_HOST (e.g. root@1.2.3.4) in deploy/deploy.local.env}"
: "${DEPLOY_DOMAIN:?Set DEPLOY_DOMAIN in deploy/deploy.local.env}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR=/opt/dashboard
LOCAL_ENV=.env

WITH_DATA=false
ROLLBACK=false
case "${1:-}" in
  --with-data) WITH_DATA=true ;;
  --rollback) ROLLBACK=true ;;
esac

step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
remote() { ssh -i "$DEPLOY_SSH_KEY" -o BatchMode=yes "$DEPLOY_HOST" "$@"; }
# A value from the local .env (empty if missing).
local_value() { grep -E "^$1=" "$LOCAL_ENV" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '
' || true; }
# Sets KEY=value in the local .env, replacing an existing line.
set_local_value() {
  if grep -qE "^$1=" "$LOCAL_ENV"; then
    sed -i "s|^$1=.*|$1=$2|" "$LOCAL_ENV"
  else
    printf '%s=%s\n' "$1" "$2" >>"$LOCAL_ENV"
  fi
}
secret() { openssl rand -hex 32; }
# Runs a compose command in the server's folder.
compose() { remote "cd $REMOTE_DIR && docker compose $*"; }
# Applied migrations on the server: a rollback over a schema change needs the old database back.
migrations() {
  compose "exec -T db psql -U dashboard -Atc 'SELECT count(*) FROM drizzle.__drizzle_migrations'" \
    2>/dev/null || echo 0
}
# Before an update: the running image and a dump of the database, kept for --rollback.
# Only the last three dumps stay.
keep_rollback_point() {
  local previous
  previous=$(remote "grep -E '^IMAGE=' $REMOTE_DIR/.env 2>/dev/null | cut -d= -f2-" || true)
  if [ -z "$previous" ] || [ "$previous" = "$IMAGE" ] ||
    ! compose "ps --status running -q db" 2>/dev/null | grep -q .; then
    return 0
  fi
  local snapshot count
  snapshot="backups/pre-deploy-$(date +%Y%m%d-%H%M%S).dump"
  count=$(migrations)
  step "Keeping a rollback point: $previous and a database dump"
  compose "exec -T db pg_dump -U dashboard -Fc dashboard > $snapshot"
  remote "cd $REMOTE_DIR && printf 'PREVIOUS_IMAGE=%s\nSNAPSHOT=%s\nMIGRATIONS=%s\n' \
    '$previous' '$snapshot' '$count' > rollback.env &&
    ls -1t backups/pre-deploy-*.dump | tail -n +4 | xargs -r rm -f"
}

# --rollback: the previous image; the database from before the update if its schema changed.
rollback() {
  step "Rolling back"
  local point
  point=$(remote "cat $REMOTE_DIR/rollback.env 2>/dev/null" || true)
  [ -n "$point" ] || {
    echo "Nothing to roll back to: no update has kept a rollback point yet (or it was used)." >&2
    exit 1
  }
  local previous snapshot count
  previous=$(printf '%s\n' "$point" | grep '^PREVIOUS_IMAGE=' | cut -d= -f2-)
  snapshot=$(printf '%s\n' "$point" | grep '^SNAPSHOT=' | cut -d= -f2-)
  count=$(printf '%s\n' "$point" | grep '^MIGRATIONS=' | cut -d= -f2-)
  remote "docker image inspect $previous >/dev/null 2>&1" ||
    { echo "The image $previous is no longer on the server." >&2 && exit 1; }
  echo "Back to $previous"
  local now
  now=$(migrations)
  if [ "$now" != "$count" ]; then
    echo "The update changed the database schema ($count → $now migrations): restoring $snapshot."
    echo "Changes made on the server since the update are lost; the computer sends its own again."
    compose "stop app backup" >/dev/null 2>&1
    compose "exec -T db dropdb -U dashboard --force dashboard" &&
      compose "exec -T db createdb -U dashboard dashboard" &&
      remote "cd $REMOTE_DIR && docker compose exec -T db pg_restore -U dashboard -d dashboard \
        --no-owner --exit-on-error < $snapshot" || {
      echo "Restoring $snapshot failed; the app is stopped. See docs/deploy.md, \"Rolling back\"." >&2
      exit 1
    }
    # A restored server is a new database for the client: it sends everything it has again.
    compose "exec -T db psql -U dashboard -c \"DELETE FROM sync.state WHERE key = 'server-id'\"" \
      >/dev/null
  fi
  remote "cd $REMOTE_DIR && sed -i '/^IMAGE=/d' .env && echo 'IMAGE=$previous' >> .env && rm rollback.env"
  compose "up -d --wait --remove-orphans 2>&1" | tail -1
  step "Done"
  echo "The server runs $previous. Sync pauses until this computer runs the same version:"
  echo "  git checkout ${previous#*:} (or revert the commit), then restart the local instance."
  exit 0
}

step "Checking the server"
remote true || {
  echo "Cannot log in to $DEPLOY_HOST with $DEPLOY_SSH_KEY (see docs/deploy.md)." >&2
  exit 1
}
remote 'command -v docker >/dev/null || (curl -fsSL https://get.docker.com | sh) >/dev/null 2>&1'
remote "mkdir -p $REMOTE_DIR/backups"
$ROLLBACK && rollback
case "$(remote uname -m)" in
  x86_64) PLATFORM=linux/amd64 ;;
  aarch64) PLATFORM=linux/arm64 ;;
  *) echo "Unsupported server architecture" >&2 && exit 1 ;;
esac

VERSION="$(git rev-parse --short HEAD)$(git diff --quiet HEAD -- . ':!deploy' || echo -dirty)"
IMAGE="personal-dashboard:$VERSION"
step "Building $IMAGE for $PLATFORM"
docker buildx build --platform "$PLATFORM" -t "$IMAGE" --load --quiet . >/dev/null

step "Uploading the image"
docker save "$IMAGE" | gzip -1 | remote 'gunzip | docker load' | tail -1

keep_rollback_point

step "Uploading the configuration"
scp -q -i "$DEPLOY_SSH_KEY" deploy/compose.yml deploy/Caddyfile deploy/backup.sh "$DEPLOY_HOST:$REMOTE_DIR/"

if ! remote "test -f $REMOTE_DIR/.env"; then
  step "Writing the server's .env (first deploy)"
  ENCRYPTION_KEY="$(local_value ENCRYPTION_KEY)"
  [ -n "$ENCRYPTION_KEY" ] || { echo "No ENCRYPTION_KEY in $LOCAL_ENV" >&2 && exit 1; }
  SYNC_TOKEN="$(secret)"
  {
    echo "DOMAIN=$DEPLOY_DOMAIN"
    echo "DB_PASSWORD=$(secret)"
    echo "JWT_SECRET=$(secret)"
    echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"
    echo "SYNC_MODE=server"
    echo "SYNC_TOKEN=$SYNC_TOKEN"
    for key in APP_TIMEZONE DEFAULT_LOCALE TELEGRAM_BOT_TOKEN SPOTIFY_CLIENT_ID SPOTIFY_CLIENT_SECRET; do
      value="$(local_value "$key")"
      [ -n "$value" ] && echo "$key=$value"
    done
    echo "BACKUP_KEEP_DAYS=14"
  } | remote "umask 077 && cat > $REMOTE_DIR/.env"

  step "Switching this computer to a sync client of the server"
  cp "$LOCAL_ENV" "$LOCAL_ENV.before-sync"
  set_local_value SYNC_MODE client
  set_local_value SYNC_TOKEN "$SYNC_TOKEN"
  set_local_value SYNC_SERVER_URL "https://$DEPLOY_DOMAIN"
  echo "Updated $LOCAL_ENV (the previous version is in $LOCAL_ENV.before-sync)."
fi
remote "cd $REMOTE_DIR && sed -i '/^IMAGE=/d' .env && echo 'IMAGE=$IMAGE' >> .env"

if $WITH_DATA; then
  step "Copying the local database to the server"
  users=$(remote "cd $REMOTE_DIR && docker compose up -d --wait db >/dev/null 2>&1 &&
    docker compose exec -T db psql -U dashboard -Atc 'SELECT count(*) FROM users' 2>/dev/null || echo 0")
  if [ "$users" != "0" ]; then
    echo "The server database already has data — not overwriting it. Sync keeps it up to date." >&2
    exit 1
  fi
  local_db=$(docker compose ps -q db)
  [ -n "$local_db" ] || { echo "The local database is not running: docker compose up -d db" >&2 && exit 1; }
  # pg-boss rebuilds its queue schema itself; sync bookkeeping belongs to this computer only.
  # Only pg_restore may read the dump from stdin, hence </dev/null on the other commands.
  docker exec "$local_db" pg_dump -U dashboard -Fc --exclude-schema=pgboss \
    --exclude-table-data='sync.*' dashboard |
    remote "cd $REMOTE_DIR && docker compose stop app </dev/null >/dev/null 2>&1;
      docker compose exec -T db dropdb -U dashboard --if-exists dashboard </dev/null &&
      docker compose exec -T db createdb -U dashboard dashboard </dev/null &&
      docker compose exec -T db pg_restore -U dashboard -d dashboard --no-owner"
  echo "Copied: $(remote "cd $REMOTE_DIR && docker compose exec -T db psql -U dashboard -Atc \
    \"SELECT count(*) || ' users, ' || (SELECT count(*) FROM diary_entries) || ' diary entries, ' ||
      (SELECT count(*) FROM finance_transactions) || ' transactions' FROM users\"")"
fi

step "Starting"
remote "cd $REMOTE_DIR && docker compose up -d --wait --remove-orphans --quiet-pull 2>&1" | tail -1 || {
  remote "cd $REMOTE_DIR && docker compose ps && docker compose logs --tail 30 app" >&2
  exit 1
}
# Images other than this one and the rollback point go.
remote "docker image prune -f >/dev/null
  keep=\$(grep -h -E '^(IMAGE|PREVIOUS_IMAGE)=' $REMOTE_DIR/.env $REMOTE_DIR/rollback.env 2>/dev/null | cut -d= -f2-)
  docker images personal-dashboard --format '{{.Repository}}:{{.Tag}}' |
    grep -v -x -F \"\$keep\" | xargs -r docker rmi >/dev/null 2>&1 || true"

step "Done"
ip="${DEPLOY_HOST#*@}"
dns=$(nslookup "$DEPLOY_DOMAIN" 2>/dev/null | grep -Eo '([0-9]{1,3}\.){3}[0-9]{1,3}' | tail -1 || true)
if [ "$dns" = "$ip" ]; then
  echo "https://$DEPLOY_DOMAIN"
else
  echo "Running. $DEPLOY_DOMAIN points to ${dns:-nothing}, the server is $ip: set an A record"
  echo "$DEPLOY_DOMAIN → $ip at your DNS provider; HTTPS starts working a few minutes later."
fi
