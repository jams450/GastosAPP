#!/usr/bin/env bash
#
# Read-only migration status for SQL/migrations/*.sql.
#
# Compares the expected set in SQL/migrations/manifest.txt against the rows a database has recorded
# in its schema_migrations ledger, and prints applied / pending / unknown per migration.
#
# This script never writes to the database. Install the ledger separately with
# SQL/schema_migrations_ledger.sql and record each migration by hand (see SQL/migrations/README.md).
#
# Usage:
#   scripts/db-migration-status.sh                 # uses libpq env vars (PGHOST, PGPORT, ...)
#   scripts/db-migration-status.sh --strict        # exit 1 when any migration is still pending
#   PGDATABASE=gastos_db PGHOST=localhost scripts/db-migration-status.sh
#
set -euo pipefail

STRICT=0
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=1 ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$arg" >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$REPO_ROOT/SQL/migrations/manifest.txt"

if [[ ! -f "$MANIFEST" ]]; then
  printf 'Missing manifest: %s\n' "$MANIFEST" >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  printf 'psql not found. Install the PostgreSQL client to read the ledger.\n' >&2
  exit 2
fi

if [[ -z "${PGDATABASE:-}" && -z "${PGSERVICE:-}" && -z "${PGCONNINFO:-}" ]]; then
  printf 'No database selected. Set PGDATABASE (and PGHOST/PGPORT/PGUSER/PGPASSWORD) first.\n' >&2
  exit 2
fi

# Table presence plus the recorded keys. A missing table is "not installed", never "nothing applied":
# those are different facts and only one of them is knowable.
LEDGER_EXISTS="$(psql --no-psqlrc --tuples-only --no-align --quiet \
  -c "SELECT to_regclass('public.schema_migrations') IS NOT NULL;" 2>/dev/null | tr -d '[:space:]')"

if [[ "$LEDGER_EXISTS" != "t" ]]; then
  printf 'Ledger not installed in database %s.\n' "${PGDATABASE:-<unknown>}"
  printf 'Install it with: psql -f SQL/schema_migrations_ledger.sql\n\n'
  printf 'Status of %s is unknown for every migration:\n' "$(wc -l < "$MANIFEST" | tr -d ' ')"
  while IFS= read -r key; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    printf '  unknown  %s\n' "$key"
  done < "$MANIFEST"
  exit 0
fi

APPLIED="$(psql --no-psqlrc --tuples-only --no-align --quiet \
  -c "SELECT migration_key FROM schema_migrations;" | tr -d '\r')"

pending=0
recorded=0
printf 'Database: %s\n\n' "${PGDATABASE:-<unknown>}"
while IFS= read -r key; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  if grep -Fxq "$key" <<<"$APPLIED"; then
    printf '  applied  %s\n' "$key"
    recorded=$((recorded + 1))
  else
    printf '  pending  %s\n' "$key"
    pending=$((pending + 1))
  fi
done < "$MANIFEST"

printf '\n%d applied, %d pending.\n' "$recorded" "$pending"

# A ledger row with no matching file means the database ran something this checkout does not know
# about: that is drift in the other direction and worth seeing.
ORPHANS="$(comm -23 <(printf '%s\n' "$APPLIED" | sort) <(grep -v '^#' "$MANIFEST" | sort))"
if [[ -n "${ORPHANS//[[:space:]]/}" ]]; then
  printf '\nRecorded but not present in manifest.txt:\n'
  printf '%s\n' "$ORPHANS" | sed 's/^/  orphan   /'
fi

if [[ "$STRICT" == "1" && "$pending" -gt 0 ]]; then
  exit 1
fi
