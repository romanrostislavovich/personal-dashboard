#!/usr/bin/env bash
# Deploys the dashboard from this computer to your server (docs/deploy.md).
#
#   deploy/deploy.sh               update and restart (every update)
#   deploy/deploy.sh --local       the same with the image built here, not the one of CI
#   deploy/deploy.sh --with-data   the first time: also copy the local database to the server
#   deploy/deploy.sh --rollback    back to the previous version (and its database, if the
#                                  update changed the schema)
#
# Before every update the server keeps the previous image and a dump of the database
# (backups/pre-deploy-*.dump) — that is what --rollback goes back to.
# The image is the one CI built for this commit: the server pulls it from ghcr.io itself (a
# public package, no login). Without one — local changes, a commit not pushed, a failed CI,
# an arm64 server — it is built here and uploaded over SSH, as with --local.
# Settings: deploy/deploy.local.env (not committed), see deploy/deploy.local.env.example.
#
# The first run also prepares the server (installs Docker, writes its .env from yours:
# the same ENCRYPTION_KEY and integration tokens, new secrets for the rest) and switches this
# computer to a sync client of the server (docs/sync.md). Secrets are never printed.
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash on Windows: keep /opt/... as it is

cd "$(dirname "$0")/.."
# One deploy at a time: two would build into the same folders and race on the server.
LOCK=dist/.deploy.lock
mkdir -p dist
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "Another deploy is running (or one was killed: remove $LOCK if not)." >&2
  exit 1
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
# shellcheck source=/dev/null
[ -f deploy/deploy.local.env ] && . deploy/deploy.local.env
: "${DEPLOY_HOST:?Set DEPLOY_HOST (e.g. root@1.2.3.4) in deploy/deploy.local.env}"
: "${DEPLOY_DOMAIN:?Set DEPLOY_DOMAIN in deploy/deploy.local.env}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR=/opt/dashboard
LOCAL_ENV=.env

WITH_DATA=false
ROLLBACK=false
LOCAL_BUILD=false
case "${1:-}" in
  --with-data) WITH_DATA=true ;;
  --rollback) ROLLBACK=true ;;
  --local) LOCAL_BUILD=true ;;
esac
# Where CI publishes the image (.github/workflows/image.yml) and its repository on GitHub.
CI_IMAGE="${CI_IMAGE:-ghcr.io/romanrostislavovich/personal-dashboard}"
GITHUB_REPO="${CI_IMAGE#ghcr.io/}"
# How long to wait for CI to publish the image of this commit before building it here.
CI_WAIT_MINUTES="${CI_WAIT_MINUTES:-25}"

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

# The image of this commit pulled by the server from ghcr.io, tagged as $IMAGE there (rollback
# and the cleanup know only those names). Fails when CI did not publish it: not pushed, failed,
# or still running after CI_WAIT_MINUTES.
pull_ci_image() {
  local sha ci tries
  sha=$(git rev-parse HEAD)
  ci="$CI_IMAGE:sha-$sha"
  [ "$PLATFORM" = linux/amd64 ] || return 1
  case "$VERSION" in *-dirty) return 1 ;; esac
  remote "docker pull -q $ci" >/dev/null 2>&1 || {
    # CI builds only what reaches main.
    git fetch -q origin main 2>/dev/null || true
    [ "$sha" = "$(git rev-parse origin/main 2>/dev/null)" ] || return 1
    echo "Waiting for CI to publish $ci (up to $CI_WAIT_MINUTES min; Ctrl+C and --local to build here)"
    tries=$((CI_WAIT_MINUTES * 2))
    until remote "docker pull -q $ci" >/dev/null 2>&1; do
      tries=$((tries - 1))
      [ "$tries" -gt 0 ] || { echo "CI did not publish it in time." >&2 && return 1; }
      # A failed run never publishes: no reason to wait it out. (Anonymous API: 60 calls an hour.)
      if [ $((tries % 4)) -eq 0 ] &&
        curl -fsS "https://api.github.com/repos/$GITHUB_REPO/actions/runs?head_sha=$sha" 2>/dev/null |
        grep -qE '"conclusion": *"(failure|cancelled|timed_out)"'; then
        echo "CI failed on this commit." >&2
        return 1
      fi
      sleep 30
    done
  }
  remote "docker tag $ci $IMAGE && docker rmi $ci >/dev/null"
  # The Android app takes its interface from the same image (deploy/mobile-apk.Dockerfile).
  WEB_IMAGE="$ci"
}

# What the desktop installers are made of, besides the app's code (which updates itself):
# Electron and electron-builder, the loader and the base it starts, the icon, the version.
installers_key() {
  {
    node -p "const l = require('./package-lock.json').packages;
      [l['node_modules/electron'].version, l['node_modules/electron-builder'].version,
       require('./package.json').version].join(' ')"
    cat apps/desktop/electron-builder.yml apps/desktop/icon.png apps/desktop/src/loader.ts
    grep -h 'SHELL_VERSION =' apps/desktop/src/update/bundle-store.ts
  } | sha256sum | cut -c1-16
}

# The installers of Settings → Apps (Windows, Linux), in downloads/desktop on the server: built
# in Docker and uploaded only when installers_key changes — rarely, they are 250 MB. The folder
# is swapped whole inside downloads/, which the app container sees live.
upload_desktop_installers() {
  local key on_server
  key=$(installers_key)
  on_server=$(remote "cat $REMOTE_DIR/downloads/desktop/installers.json 2>/dev/null" |
    grep -o '"key": *"[^"]*"' | cut -d'"' -f4 || true)
  [ "$key" = "$on_server" ] && return 0
  step "Building the desktop installers (Electron, the loader or the icon changed; ~10 min the first time)"
  # Called with `||`: set -e is off in here, so every step says whether it worked.
  rm -rf dist/server-installers || return 1
  docker buildx build -f deploy/desktop-installers.Dockerfile --build-arg "KEY=$key" \
    --build-arg "VERSION=$(node -p "require('./package.json').version")" \
    --output type=local,dest=dist/server-installers --quiet . >/dev/null || return 1
  # Both installers and the list, or nothing goes to the server.
  ls dist/server-installers/*.exe dist/server-installers/*.AppImage \
    dist/server-installers/installers.json >/dev/null || return 1
  step "Uploading the desktop installers"
  remote "rm -rf $REMOTE_DIR/downloads/desktop.new && mkdir -p $REMOTE_DIR/downloads/desktop.new" &&
    scp -q -i "$DEPLOY_SSH_KEY" dist/server-installers/* \
      "$DEPLOY_HOST:$REMOTE_DIR/downloads/desktop.new/" &&
    remote "cd $REMOTE_DIR/downloads && rm -rf desktop.old &&
      { [ ! -d desktop ] || mv desktop desktop.old; } && mv desktop.new desktop && rm -rf desktop.old"
}

# What the Android app is made of, besides its interface (which updates itself from the server):
# Capacitor and its plugins, the Android project, the build.
apk_key() {
  {
    node -p "const l = require('./package-lock.json').packages;
      Object.keys(l).filter((k) => k.startsWith('node_modules/@capacitor/'))
        .map((k) => k + '@' + l[k].version).join(' ')"
    git ls-files -z apps/mobile/android apps/mobile/capacitor.config.ts deploy/mobile-apk.Dockerfile |
      xargs -0 cat
    # Push notifications come with the Firebase file: adding it builds the app again.
    [ ! -f deploy/google-services.json ] || cat deploy/google-services.json
  } | sha256sum | cut -c1-16
}

# The Android app of Settings → Apps, in downloads/mobile on the server: built in Docker and
# uploaded only when apk_key changes. It is signed with deploy/mobile-release.keystore (its
# password: MOBILE_KEYSTORE_PASSWORD in deploy.local.env) — the same key every time, or Android
# does not install the update over the app on the phone.
upload_mobile_apk() {
  local key on_server count
  if [ ! -f deploy/mobile-release.keystore ] || [ -z "${MOBILE_KEYSTORE_PASSWORD:-}" ]; then
    echo "No deploy/mobile-release.keystore or MOBILE_KEYSTORE_PASSWORD: the Android app is not built." >&2
    return 0
  fi
  key=$(apk_key)
  on_server=$(remote "cat $REMOTE_DIR/downloads/mobile/apk.json 2>/dev/null" |
    grep -o '"key": *"[^"]*"' | cut -d'"' -f4 || true)
  [ "$key" = "$on_server" ] && return 0
  step "Building the Android app (its native part changed; ~10 min the first time)"
  # Android installs an update only with a larger versionCode: the number of commits grows.
  count=$(git rev-list --count HEAD)
  # Push notifications (Settings → Integrations): the Firebase file, if the owner made one.
  local firebase=()
  [ ! -f deploy/google-services.json ] ||
    firebase=(--secret id=google_services,src=deploy/google-services.json)
  rm -rf dist/server-apk || return 1
  MOBILE_KEYSTORE_PASSWORD="$MOBILE_KEYSTORE_PASSWORD" docker buildx build \
    -f deploy/mobile-apk.Dockerfile --build-arg "BUILD_ID=$key" \
    --build-arg "VERSION_NAME=$(node -p "require('./package.json').version").$count" \
    --build-arg "VERSION_CODE=$count" --build-arg "WEB_IMAGE=$WEB_IMAGE" \
    --secret id=keystore,src=deploy/mobile-release.keystore \
    --secret id=keystore_password,env=MOBILE_KEYSTORE_PASSWORD \
    "${firebase[@]}" \
    --output type=local,dest=dist/server-apk --quiet . >/dev/null || return 1
  ls dist/server-apk/personal-dashboard.apk dist/server-apk/apk.json >/dev/null || return 1
  step "Uploading the Android app"
  remote "rm -rf $REMOTE_DIR/downloads/mobile.new && mkdir -p $REMOTE_DIR/downloads/mobile.new" &&
    scp -q -i "$DEPLOY_SSH_KEY" dist/server-apk/* "$DEPLOY_HOST:$REMOTE_DIR/downloads/mobile.new/" &&
    remote "cd $REMOTE_DIR/downloads && rm -rf mobile.old &&
      { [ ! -d mobile ] || mv mobile mobile.old; } && mv mobile.new mobile && rm -rf mobile.old"
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
remote "mkdir -p $REMOTE_DIR/backups $REMOTE_DIR/security $REMOTE_DIR/downloads"
$ROLLBACK && rollback
case "$(remote uname -m)" in
  x86_64) PLATFORM=linux/amd64 ;;
  aarch64) PLATFORM=linux/arm64 ;;
  *) echo "Unsupported server architecture" >&2 && exit 1 ;;
esac

VERSION="$(git rev-parse --short HEAD)$(git diff --quiet HEAD -- . ':!deploy' || echo -dirty)"
IMAGE="personal-dashboard:$VERSION"
WEB_IMAGE="$IMAGE"
if ! $LOCAL_BUILD && { step "Taking the image CI built"; pull_ci_image; }; then
  echo "The server pulled the image of $VERSION from ghcr.io."
else
  step "Building $IMAGE for $PLATFORM"
  docker buildx build --platform "$PLATFORM" -t "$IMAGE" --load --quiet . >/dev/null

  step "Uploading the image"
  docker save "$IMAGE" | gzip -1 | remote 'gunzip | docker load' | tail -1
fi

keep_rollback_point

step "Uploading the configuration"
scp -q -i "$DEPLOY_SSH_KEY" deploy/compose.yml deploy/Caddyfile deploy/backup.sh \
  deploy/security-scan.sh "$DEPLOY_HOST:$REMOTE_DIR/"
# The security agent's eyes on the server itself: a read-only scan every hour (as root, to see
# the firewall and the SSH settings), and once now so the first report is there at once.
remote "printf '%s\n' 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' \
    '17 * * * * root bash $REMOTE_DIR/security-scan.sh' > /etc/cron.d/dashboard-security &&
  chmod 644 /etc/cron.d/dashboard-security && bash $REMOTE_DIR/security-scan.sh" ||
  echo "The scan of the server did not run: the security agent will not see the host." >&2

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
    for key in APP_TIMEZONE DEFAULT_LOCALE; do
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
# Caddy reads its Caddyfile only when it starts: a changed one is taken in without a restart.
remote "cd $REMOTE_DIR && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile" \n  >/dev/null 2>&1 || echo "Caddy did not reload its configuration (docker compose logs caddy)." >&2
# Images other than this one and the rollback point go.
remote "docker image prune -f >/dev/null
  keep=\$(grep -h -E '^(IMAGE|PREVIOUS_IMAGE)=' $REMOTE_DIR/.env $REMOTE_DIR/rollback.env 2>/dev/null | cut -d= -f2-)
  docker images personal-dashboard --format '{{.Repository}}:{{.Tag}}' |
    grep -v -x -F \"\$keep\" | xargs -r docker rmi >/dev/null 2>&1 || true"

# After the app runs: the installers are a convenience, and a failed build of them must not keep
# the update from the server.
upload_desktop_installers ||
  echo "The desktop installers were not updated: Settings → Apps keeps the previous ones." >&2
upload_mobile_apk ||
  echo "The Android app was not updated: Settings → Apps keeps the previous one." >&2

# This computer: Docker's disk only grows (it held 135 GB of build cache on 2026-10-27). The cache
# not used for 3 days goes (what the builds use — npm, Gradle — stays fresh), and the images of
# older deploys, but the last two. (--keep-storage frees next to nothing on BuildKit 0.32.)
docker buildx prune -f --all --filter until=72h >/dev/null 2>&1 || true
docker images personal-dashboard --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' | sort -r |
  tail -n +3 | cut -f2 | xargs -r docker rmi >/dev/null 2>&1 || true

step "Done"
ip="${DEPLOY_HOST#*@}"
dns=$(nslookup "$DEPLOY_DOMAIN" 2>/dev/null | grep -Eo '([0-9]{1,3}\.){3}[0-9]{1,3}' | tail -1 || true)
if [ "$dns" = "$ip" ]; then
  echo "https://$DEPLOY_DOMAIN"
else
  echo "Running. $DEPLOY_DOMAIN points to ${dns:-nothing}, the server is $ip: set an A record"
  echo "$DEPLOY_DOMAIN → $ip at your DNS provider; HTTPS starts working a few minutes later."
fi
