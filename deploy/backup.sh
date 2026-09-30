#!/bin/sh
# Runs in the `backup` container: a dump right after start, then once a day. Once a week the
# fresh dump is also restored into a scratch database and its row counts compared with the live
# ones — a backup is only as good as its restore. The result goes to restore-check.json, which the
# dashboard reads (BACKUP_DIR) and reports on. Restore by hand: see docs/deploy.md.
set -eu

CHECK_DB=dashboard_restore_check
CHECK_FILE=/backups/restore-check.json

# "table|rows" for every table of the public schema, one per line.
counts() {
  psql -d "$1" -Atc "
    SELECT c.relname || '|' || (xpath('/row/n/text()', query_to_xml(
      format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text
    FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
    WHERE s.nspname = 'public' AND c.relkind = 'r' ORDER BY 1"
}

# The restored count of a table must lie between the live counts taken right before and right
# after the dump (rows keep coming while it runs), give or take 1% or 5 rows.
compare() {
  awk -F'|' '
    FILENAME == ARGV[1] { before[$1] = $2 + 0; next }
    FILENAME == ARGV[2] { after[$1] = $2 + 0; next }
    { restored[$1] = $2 + 0 }
    END {
      for (t in before) {
        tables++
        lo = before[t] < after[t] ? before[t] : after[t]
        hi = before[t] < after[t] ? after[t] : before[t]
        got = (t in restored) ? restored[t] : -1
        if (got > 0) rows += got
        slack = int(hi / 100); if (slack < 5) slack = 5
        if (got < 0 || got < lo - slack || got > hi + slack) {
          list = list (n++ ? "," : "") "{\"table\":\"" t "\",\"live\":" hi ",\"restored\":" got "}"
        }
      }
      printf "\"tables\":%d,\"rows\":%d,\"mismatches\":[%s]", tables, rows, list
    }' "$@"
}

# Restores the dump into CHECK_DB and writes CHECK_FILE.
restore_check() {
  dump=$1 before=$2 after=$3
  error=""
  if dropdb --if-exists "$CHECK_DB" && createdb "$CHECK_DB" &&
    pg_restore --no-owner --exit-on-error -d "$CHECK_DB" "$dump" 2>/tmp/restore.log; then
    counts "$CHECK_DB" >/tmp/restored
    result=$(compare "$before" "$after" /tmp/restored)
  else
    error=$(tail -1 /tmp/restore.log | tr -d '"\\' | cut -c1-300)
    result='"tables":0,"rows":0,"mismatches":[]'
  fi
  dropdb --if-exists "$CHECK_DB" || true
  case "$result" in *'"mismatches":[]'*) ok=true ;; *) ok=false ;; esac
  [ -n "$error" ] && ok=false
  printf '{"checkedAt":"%s","dump":"%s","ok":%s,"error":%s,%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "$dump")" "$ok" \
    "$([ -n "$error" ] && printf '"%s"' "$error" || echo null)" "$result" >"$CHECK_FILE.tmp"
  mv "$CHECK_FILE.tmp" "$CHECK_FILE"
  echo "$(date -Iseconds) restore check: ok=$ok"
}

while true; do
  file="/backups/dashboard-$(date +%Y-%m-%d).dump"
  # Weekly: when the last check is older than 7 days (or there is none).
  check=false
  [ -z "$(find /backups -maxdepth 1 -name restore-check.json -mtime -7)" ] && check=true
  $check && counts "$PGDATABASE" >/tmp/before
  # -Fc: compressed, restorable with pg_restore; written to .tmp so a failed dump never
  # replaces a good one.
  if pg_dump -Fc -f "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "$(date -Iseconds) backup written: $file ($(du -h "$file" | cut -f1))"
    if $check; then
      counts "$PGDATABASE" >/tmp/after
      restore_check "$file" /tmp/before /tmp/after
    fi
  else
    rm -f "$file.tmp"
    echo "$(date -Iseconds) backup FAILED" >&2
  fi
  find /backups -name 'dashboard-*.dump' -mtime +"$KEEP_DAYS" -delete
  sleep 86400
done
