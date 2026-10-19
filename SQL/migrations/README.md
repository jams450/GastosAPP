# SQL migrations

This solution has no EF migrations. DDL lives in two places:

- `SQL/schema.sql` — the bootstrap schema for a fresh Docker Postgres.
- `SQL/migrations/*.sql` — dated, incremental changes applied on top of a database that already
  exists.

## Why there is a ledger

`SQL/migrations/` alone cannot answer "which of these does the deployed database already have?".
That question matters because some files are backfills or data migrations that are not idempotent to
re-run blindly, and because a change written but never applied is a silent production gap.

Three small pieces close that gap, and none of them touch a database on its own:

| Piece | Purpose |
| --- | --- |
| `manifest.txt` | The expected set of migrations, one file name per line, in order. The source of truth the checks compare against. |
| `SQL/schema_migrations_ledger.sql` | Creates the `schema_migrations` table that records what a database has applied. Installed once per environment. |
| `scripts/db-migration-status.sh` | Read-only report of applied vs. pending for the database you point it at. |

## Convention for a new migration

1. Name the file `YYYY-MM-DD_lower_snake_description.sql`. The date is when the change is authored,
   not when it is applied.
2. Add its file name to `manifest.txt`, keeping the file sorted. `GastosApp.Backend.Tests` fails the
   build if the manifest and the directory disagree, if an entry breaks the naming rule, or if the
   list is out of order — so a migration added without registering it cannot slip through.
3. Apply it, and record it in the same transaction:

   ```sql
   BEGIN;
   \i SQL/migrations/2026-10-16_your_change.sql
   INSERT INTO schema_migrations (migration_key, applied_by)
   VALUES ('2026-10-16_your_change.sql', current_user)
   ON CONFLICT (migration_key) DO NOTHING;
   COMMIT;
   ```

4. Confirm with `scripts/db-migration-status.sh`.

## Current state

The ledger table has **not been installed** on any environment and **no historical migration is
recorded yet**, so the applied/pending status of the 25 existing migrations is unknown. The status
script reports exactly that rather than guessing. Installing the ledger and backfilling it requires
database access and an explicit decision; it is out of scope for the change that introduced these
files.

## Scope

Nothing here applies migrations automatically, and nothing here writes to a database. Applying a
migration stays a deliberate, human-run action.
