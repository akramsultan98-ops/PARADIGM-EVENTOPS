#!/usr/bin/env bash
# Nightly backup: PostgreSQL dump + uploaded files. Usage: scripts/backup.sh /var/backups/eventops
set -euo pipefail
DEST="${1:-./backups}"; TS="$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -p "$DEST"
: "${DATABASE_URL:?DATABASE_URL must be set}"
pg_dump --format=custom --no-owner "$DATABASE_URL" > "$DEST/eventops-db-$TS.dump"
tar -czf "$DEST/eventops-uploads-$TS.tar.gz" -C "${STORAGE_LOCAL_DIR:-./storage/uploads}" .
find "$DEST" -type f -mtime +30 -delete   # keep 30 days
echo "Backup written to $DEST ($TS)"
