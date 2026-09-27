#!/bin/sh
# Runs in the `backup` container: a dump right after start, then once a day.
# Restore: see docs/deploy.md.
set -eu

while true; do
  file="/backups/dashboard-$(date +%Y-%m-%d).dump"
  # -Fc: compressed, restorable with pg_restore; written to .tmp so a failed dump never
  # replaces a good one.
  if pg_dump -Fc -f "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "$(date -Iseconds) backup written: $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.tmp"
    echo "$(date -Iseconds) backup FAILED" >&2
  fi
  find /backups -name 'dashboard-*.dump' -mtime +"$KEEP_DAYS" -delete
  sleep 86400
done
