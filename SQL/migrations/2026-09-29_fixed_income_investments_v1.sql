-- Fixed-income investments V1. Idempotent for existing PostgreSQL databases.
-- This migration has not shipped to any environment, so it is kept as a single file that both
-- creates the tables and applies the V1 corrections (institution catalog, inferred validity,
-- literal condition text, exclusion snapshot, projection horizon 1..24).

BEGIN;

CREATE TABLE IF NOT EXISTS investment_products (
    investment_product_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    account_id INT REFERENCES accounts(account_id) ON DELETE RESTRICT,
    name VARCHAR(120) NOT NULL,
    institution VARCHAR(120) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100), updated_by VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_investment_products_user_active ON investment_products(user_id, active);
CREATE UNIQUE INDEX IF NOT EXISTS ux_investment_products_active_account ON investment_products(user_id, account_id) WHERE active;

-- Institution catalog: the seven allowed codes, never free text.
-- Legacy rows written before the catalog existed may hold free text or a different casing. Normalize
-- them first (the update is convergent, so re-running is a no-op), then refuse to continue if any
-- value is still outside the catalog: a silent coercion would invent a product we cannot verify.
UPDATE investment_products
SET institution = CASE
        WHEN replace(lower(trim(institution)), ' ', '_') IN ('mercadolibre', 'mercado_libre') THEN 'mercado_libre'
        WHEN replace(lower(trim(institution)), ' ', '_') IN ('revolut') THEN 'revolut'
        WHEN replace(lower(trim(institution)), ' ', '_') IN ('cetes', 'cet', 'cetesdirecto') THEN 'cetes'
        WHEN replace(lower(trim(institution)), ' ', '_') IN ('nu', 'nubank') THEN 'nu'
        WHEN replace(lower(trim(institution)), ' ', '_') IN ('klar') THEN 'klar'
        WHEN replace(lower(trim(institution)), ' ', '_') IN ('finsus') THEN 'finsus'
        WHEN replace(lower(trim(institution)), ' ', '_') IN ('didi', 'didi_banco') THEN 'didi'
        ELSE replace(lower(trim(institution)), ' ', '_')
    END
WHERE institution IS DISTINCT FROM CASE
        WHEN replace(lower(trim(institution)), ' ', '_') IN ('mercadolibre', 'mercado_libre') THEN 'mercado_libre'
        WHEN replace(lower(trim(institution)), ' ', '_') IN ('revolut') THEN 'revolut'
        WHEN replace(lower(trim(institution)), ' ', '_') IN ('cetes', 'cet', 'cetesdirecto') THEN 'cetes'
        WHEN replace(lower(trim(institution)), ' ', '_') IN ('nu', 'nubank') THEN 'nu'
        WHEN replace(lower(trim(institution)), ' ', '_') IN ('klar') THEN 'klar'
        WHEN replace(lower(trim(institution)), ' ', '_') IN ('finsus') THEN 'finsus'
        WHEN replace(lower(trim(institution)), ' ', '_') IN ('didi', 'didi_banco') THEN 'didi'
        ELSE replace(lower(trim(institution)), ' ', '_')
    END;

DO $$
DECLARE
    unknown_codes TEXT;
BEGIN
    SELECT string_agg(DISTINCT institution, ', ' ORDER BY institution)
    INTO unknown_codes
    FROM investment_products
    WHERE institution NOT IN ('revolut', 'cetes', 'nu', 'klar', 'finsus', 'didi', 'mercado_libre');

    IF unknown_codes IS NOT NULL THEN
        RAISE EXCEPTION
            'Cannot apply the V1 institution catalog: investment_products.institution still holds unmapped values (%). Map them to one of the seven catalog codes and re-run this migration.',
            unknown_codes;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_investment_products_institution'
    ) THEN
        ALTER TABLE investment_products
            ADD CONSTRAINT ck_investment_products_institution
            CHECK (institution IN ('revolut', 'cetes', 'nu', 'klar', 'finsus', 'didi', 'mercado_libre'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS investment_offers (
    investment_offer_id SERIAL PRIMARY KEY,
    investment_product_id INT NOT NULL REFERENCES investment_products(investment_product_id) ON DELETE CASCADE,
    captured_for_month CHAR(7) NOT NULL CHECK (captured_for_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    valid_from DATE NOT NULL, valid_to DATE NOT NULL,
    source_url VARCHAR(500) NOT NULL, source_label VARCHAR(120) NOT NULL, conditions_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100), updated_by VARCHAR(100),
    CONSTRAINT ck_investment_offers_validity CHECK (valid_to >= valid_from),
    UNIQUE (investment_product_id, captured_for_month)
);
ALTER TABLE investment_offers ADD COLUMN IF NOT EXISTS source_label VARCHAR(120);
UPDATE investment_offers SET source_label = 'Source' WHERE source_label IS NULL;
ALTER TABLE investment_offers ALTER COLUMN source_label SET NOT NULL;

-- Inferred validity: TRUE when valid_to was derived (December 31 of the capture year) instead of
-- declared by the user or published by the source.
ALTER TABLE investment_offers ADD COLUMN IF NOT EXISTS validity_inferred BOOLEAN;
-- Backfill for rows created before the flag existed. The only rows that can be reconstructed with
-- confidence are those whose validity end is exactly December 31 of the capture year, which is the
-- inferred shape; any other declared date cannot be classified and therefore stays FALSE. The
-- update is guarded by IS NULL, so re-running the migration is a no-op.
UPDATE investment_offers
SET validity_inferred = (valid_to = make_date(SUBSTRING(captured_for_month FROM 1 FOR 4)::int, 12, 31))
WHERE validity_inferred IS NULL;
ALTER TABLE investment_offers ALTER COLUMN validity_inferred SET DEFAULT FALSE;
ALTER TABLE investment_offers ALTER COLUMN validity_inferred SET NOT NULL;

-- Offer-level literal terms text (campaign wording copied as entered, never parsed).
ALTER TABLE investment_offers ADD COLUMN IF NOT EXISTS terms_text VARCHAR(1000);
CREATE INDEX IF NOT EXISTS idx_investment_offers_product_capture ON investment_offers(investment_product_id, captured_for_month);

CREATE TABLE IF NOT EXISTS investment_rate_tiers (
    investment_rate_tier_id SERIAL PRIMARY KEY,
    investment_offer_id INT NOT NULL REFERENCES investment_offers(investment_offer_id) ON DELETE CASCADE,
    minimum_amount DECIMAL(15,2) NOT NULL CHECK (minimum_amount >= 0),
    maximum_amount DECIMAL(15,2), annual_rate_percent DECIMAL(7,4) NOT NULL CHECK (annual_rate_percent >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100), updated_by VARCHAR(100),
    CONSTRAINT ck_investment_rate_tiers_range CHECK (maximum_amount IS NULL OR maximum_amount > minimum_amount),
    UNIQUE (investment_offer_id, minimum_amount)
);
-- Per-tier literal special condition. When present, generation requires an explicit per-tier
-- confirmation from the request.
ALTER TABLE investment_rate_tiers ADD COLUMN IF NOT EXISTS special_condition_text VARCHAR(1000);

CREATE TABLE IF NOT EXISTS investment_plans (
    investment_plan_id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    plan_month CHAR(7) NOT NULL CHECK (plan_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), projection_months INT NOT NULL CHECK (projection_months BETWEEN 1 AND 24),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_by VARCHAR(100), updated_by VARCHAR(100),
    UNIQUE(user_id, plan_month)
);

-- Projection horizon is 1..24. Clamp legacy values before enforcing the range so the constraint add
-- cannot fail, then replace any pre-existing projection_months CHECK with the named one.
UPDATE investment_plans SET projection_months = 24 WHERE projection_months > 24;
UPDATE investment_plans SET projection_months = 1 WHERE projection_months < 1;
DO $$
DECLARE
    existing RECORD;
BEGIN
    FOR existing IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'investment_plans'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%projection_months%'
          AND conname <> 'ck_investment_plans_projection_months'
    LOOP
        EXECUTE format('ALTER TABLE investment_plans DROP CONSTRAINT %I', existing.conname);
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_investment_plans_projection_months'
    ) THEN
        ALTER TABLE investment_plans
            ADD CONSTRAINT ck_investment_plans_projection_months
            CHECK (projection_months BETWEEN 1 AND 24);
    END IF;
END $$;

-- Exclusions reported by the generation that produced the plan row, kept as a snapshot.
ALTER TABLE investment_plans ADD COLUMN IF NOT EXISTS exclusions_json TEXT;
UPDATE investment_plans SET exclusions_json = '[]' WHERE exclusions_json IS NULL;
ALTER TABLE investment_plans ALTER COLUMN exclusions_json SET DEFAULT '[]';
ALTER TABLE investment_plans ALTER COLUMN exclusions_json SET NOT NULL;

CREATE TABLE IF NOT EXISTS investment_plan_allocations (
    investment_plan_allocation_id SERIAL PRIMARY KEY, investment_plan_id INT NOT NULL REFERENCES investment_plans(investment_plan_id) ON DELETE CASCADE,
    investment_product_id INT NOT NULL REFERENCES investment_products(investment_product_id) ON DELETE RESTRICT,
    account_id INT NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT, allocated_amount DECIMAL(15,2) NOT NULL,
    product_name_snapshot VARCHAR(120) NOT NULL, institution_snapshot VARCHAR(120) NOT NULL, offer_source_url_snapshot VARCHAR(500) NOT NULL,
    offer_source_label_snapshot VARCHAR(120) NOT NULL, offer_captured_for_month_snapshot CHAR(7) NOT NULL CHECK (offer_captured_for_month_snapshot ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    offer_valid_from_snapshot DATE NOT NULL, offer_valid_to_snapshot DATE NOT NULL, conditions_confirmed_snapshot BOOLEAN NOT NULL, tier_snapshot_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_by VARCHAR(100), updated_by VARCHAR(100),
    UNIQUE(investment_plan_id, investment_product_id)
);
ALTER TABLE investment_plan_allocations ADD COLUMN IF NOT EXISTS offer_source_label_snapshot VARCHAR(120);
ALTER TABLE investment_plan_allocations ADD COLUMN IF NOT EXISTS offer_captured_for_month_snapshot CHAR(7);
UPDATE investment_plan_allocations
SET offer_source_label_snapshot = 'Source',
    offer_captured_for_month_snapshot = to_char(created_at, 'YYYY-MM')
WHERE offer_source_label_snapshot IS NULL OR offer_captured_for_month_snapshot IS NULL;
ALTER TABLE investment_plan_allocations ALTER COLUMN offer_source_label_snapshot SET NOT NULL;
ALTER TABLE investment_plan_allocations ALTER COLUMN offer_captured_for_month_snapshot SET NOT NULL;

-- Snapshot of the inferred-validity flag and the offer terms text used by each allocation.
ALTER TABLE investment_plan_allocations ADD COLUMN IF NOT EXISTS offer_validity_inferred_snapshot BOOLEAN;
UPDATE investment_plan_allocations SET offer_validity_inferred_snapshot = FALSE WHERE offer_validity_inferred_snapshot IS NULL;
ALTER TABLE investment_plan_allocations ALTER COLUMN offer_validity_inferred_snapshot SET DEFAULT FALSE;
ALTER TABLE investment_plan_allocations ALTER COLUMN offer_validity_inferred_snapshot SET NOT NULL;
ALTER TABLE investment_plan_allocations ADD COLUMN IF NOT EXISTS terms_snapshot TEXT;

ANALYZE investment_products;
ANALYZE investment_offers;
ANALYZE investment_plans;
ANALYZE investment_plan_allocations;

COMMIT;
