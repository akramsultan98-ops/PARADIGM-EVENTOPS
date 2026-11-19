#!/usr/bin/env bash
# Nightly backup: PostgreSQL dump + uploaded files, ENCRYPTED. Usage: scripts/backup.sh /var/backups/eventops
#
#   DATABASE_URL            postgresql://user:password@host:port/db   (required)
#   BACKUP_PASSPHRASE_FILE  file containing the encryption passphrase (required; chmod 600, keep a copy offline)
#   BACKUP_ALLOW_UNENCRYPTED=true   explicit opt-out (not recommended)
#   STORAGE_LOCAL_DIR       uploads directory (default ./storage/uploads)
#   BACKUP_RETENTION_DAYS   default 30
#
# Security (P3): the database password is passed to pg_dump through PGPASSWORD (environment), never on the command
# line, so it cannot be read from `ps`. Output files are created with mode 600 (umask 077) and encrypted with
# AES-256-CBC + PBKDF2 (openssl). Restore:
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:$BACKUP_PASSPHRASE_FILE -in X.dump.enc | pg_restore -d <db>
set -euo pipefail
umask 077
DEST="${1:-./backups}"; TS="$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -p "$DEST"
: "${DATABASE_URL:?DATABASE_URL must be set}"

urldecode() { local s="${1//+/ }"; printf '%b' "${s//%/\\x}"; }
re='^postgres(ql)?://([^:/@]+)(:([^@]*))?@([^:/?]+)(:([0-9]+))?/([^?]+)'
if [[ ! "$DATABASE_URL" =~ $re ]]; then echo "DATABASE_URL is not a postgresql:// URL" >&2; exit 2; fi
export PGUSER; PGUSER="$(urldecode "${BASH_REMATCH[2]}")"
export PGPASSWORD; PGPASSWORD="$(urldecode "${BASH_REMATCH[4]}")"
export PGHOST="${BASH_REMATCH[5]}" PGPORT="${BASH_REMATCH[7]:-5432}" PGDATABASE="${BASH_REMATCH[8]}"
unset DATABASE_URL

if [[ -n "${BACKUP_PASSPHRASE_FILE:-}" ]]; then
  [[ -r "$BACKUP_PASSPHRASE_FILE" ]] || { echo "BACKUP_PASSPHRASE_FILE is not readable" >&2; exit 2; }
  encrypt() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$BACKUP_PASSPHRASE_FILE"; }
  EXT=".enc"
elif [[ "${BACKUP_ALLOW_UNENCRYPTED:-}" == "true" ]]; then
  echo "WARNING: writing UNENCRYPTED backups (BACKUP_ALLOW_UNENCRYPTED=true)" >&2
  encrypt() { cat; }
  EXT=""
else
  echo "Refusing to write unencrypted backups: set BACKUP_PASSPHRASE_FILE (or BACKUP_ALLOW_UNENCRYPTED=true)" >&2; exit 2
fi

pg_dump --format=custom --no-owner | encrypt > "$DEST/eventops-db-$TS.dump$EXT"
tar -czf - -C "${STORAGE_LOCAL_DIR:-./storage/uploads}" . | encrypt > "$DEST/eventops-uploads-$TS.tar.gz$EXT"
find "$DEST" -type f -name 'eventops-*' -mtime +"${BACKUP_RETENTION_DAYS:-30}" -delete
echo "Backup written to $DEST ($TS${EXT:+, encrypted})"
