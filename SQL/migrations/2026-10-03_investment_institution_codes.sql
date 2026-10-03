-- Run after 2026-09-29_fixed_income_investments_v1.sql on existing databases.
-- Expand the controlled catalog without rewriting products or historical snapshots.
-- Transactional and repeatable; replacing the CHECK takes a table lock and validates rows.
BEGIN;

ALTER TABLE investment_products
    DROP CONSTRAINT IF EXISTS ck_investment_products_institution;

ALTER TABLE investment_products
    ADD CONSTRAINT ck_investment_products_institution
    CHECK (institution IN ('revolut', 'cetes', 'nu', 'klar', 'finsus', 'didi', 'mercado_libre', 'openbank', 'mifel', 'otra'));

COMMIT;
