-- Additive, repeatable correction for databases with the original required product link.
-- Apply after the fixed-income V1 migration. No data or allocation snapshots are rewritten.
BEGIN;
ALTER TABLE investment_products ALTER COLUMN account_id DROP NOT NULL;
-- Keep the RESTRICT foreign key and ux_investment_products_active_account unchanged.
-- PostgreSQL permits multiple NULL links in the existing partial unique index.
COMMIT;
