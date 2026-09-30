-- Fixed-income investments V1. Idempotent for existing PostgreSQL databases.
CREATE TABLE IF NOT EXISTS investment_products (
    investment_product_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    account_id INT NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
    name VARCHAR(120) NOT NULL,
    institution VARCHAR(120) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100), updated_by VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_investment_products_user_active ON investment_products(user_id, active);
CREATE UNIQUE INDEX IF NOT EXISTS ux_investment_products_active_account ON investment_products(user_id, account_id) WHERE active;

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
CREATE TABLE IF NOT EXISTS investment_plans (
    investment_plan_id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    plan_month CHAR(7) NOT NULL CHECK (plan_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), projection_months INT NOT NULL CHECK (projection_months BETWEEN 1 AND 120),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_by VARCHAR(100), updated_by VARCHAR(100),
    UNIQUE(user_id, plan_month)
);
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
