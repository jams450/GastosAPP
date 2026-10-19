-- Ledger for SQL/migrations/*.sql.
--
-- This solution has no EF migrations: DDL lives in SQL/schema.sql plus the dated files under
-- SQL/migrations/. Until this ledger exists there is no way to tell which of those files a given
-- deployed database has already applied.
--
-- This file only creates the ledger table. It deliberately seeds nothing: no environment has
-- recorded its migrations yet, so claiming any row as applied here would be an invented fact.
-- Record a migration explicitly once it is known to be applied, inside the same transaction as
-- the migration itself:
--
--   BEGIN;
--   \i SQL/migrations/2026-10-16_dashboard_cutoff_msi_original_payments.sql
--   INSERT INTO schema_migrations (migration_key, applied_by)
--   VALUES ('2026-10-16_dashboard_cutoff_msi_original_payments.sql', current_user)
--   ON CONFLICT (migration_key) DO NOTHING;
--   COMMIT;
--
-- Report drift with scripts/db-migration-status.sh, which is read-only.

CREATE TABLE IF NOT EXISTS schema_migrations (
    -- The migration's file name, exactly as it appears in SQL/migrations/ and in manifest.txt.
    migration_key TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Who ran it. current_user by convention; nullable because a backfill cannot know.
    applied_by TEXT
);

COMMENT ON TABLE schema_migrations IS
    'Applied SQL/migrations/*.sql files, keyed by file name. See SQL/migrations/README.md.';
