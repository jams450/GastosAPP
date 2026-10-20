-- Multi-currency foundation: currency catalog and FX rates.
--
-- Both tables are additive. Nothing here changes an existing amount, so applying it cannot alter a
-- balance, a budget or a projection. The behaviour change arrives in later migrations that add a
-- currency to transactions, accounts, budgets and investment products.
--
-- Idempotent: every statement is re-runnable.
--
-- The Banxico series code per currency is deliberately NOT stored here. It lives in API
-- configuration (`Banxico:Series`), so a wrong code is a config change instead of a migration, and
-- the table cannot drift into two sources of truth for the same fact. A currency with no configured
-- series simply cannot be fetched, which fails visibly instead of storing an invented rate.

BEGIN;

CREATE TABLE IF NOT EXISTS currencies (
    code VARCHAR(3) PRIMARY KEY,
    name TEXT NOT NULL,
    -- Display symbol only. Formatting uses the locale + code, never this value.
    symbol VARCHAR(8) NOT NULL DEFAULT '',
    -- ISO 4217 minor units: JPY has 0, most others 2. Drives rounding, not display.
    decimals SMALLINT NOT NULL DEFAULT 2,
    -- Exactly one base currency: everything consolidates into it.
    is_base BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT chk_currencies_code_upper CHECK (code = upper(code)),
    CONSTRAINT chk_currencies_decimals CHECK (decimals BETWEEN 0 AND 4)
);

-- At most one base currency. A second row claiming the base fails here rather than silently winning.
CREATE UNIQUE INDEX IF NOT EXISTS uq_currencies_single_base ON currencies(is_base) WHERE is_base;

INSERT INTO currencies (code, name, symbol, decimals, is_base, active) VALUES
    ('MXN', 'Peso mexicano', '$', 2, TRUE, TRUE),
    ('USD', 'Dólar estadounidense', 'US$', 2, FALSE, TRUE),
    ('EUR', 'Euro', '€', 2, FALSE, TRUE),
    ('GBP', 'Libra esterlina', '£', 2, FALSE, TRUE),
    ('CAD', 'Dólar canadiense', 'C$', 2, FALSE, TRUE),
    ('JPY', 'Yen japonés', '¥', 0, FALSE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- One row per business day and currency. `rate_mxn` is MXN per ONE unit of `currency_code`, so
-- converting is a multiplication and there is no inverted-rate ambiguity to get wrong.
--
-- Weekends and holidays have no row on purpose: Banxico does not publish then. Readers resolve the
-- missing date by carrying the last published rate forward (see FxRateSelection), and the movement
-- records which date's rate it actually used.
CREATE TABLE IF NOT EXISTS fx_rates (
    currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,
    rate_date DATE NOT NULL,
    rate_mxn DECIMAL(18, 8) NOT NULL,
    -- Provenance: which mechanism produced the row. A manual correction is distinguishable.
    source VARCHAR(24) NOT NULL DEFAULT 'banxico',
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (currency_code, rate_date),
    CONSTRAINT chk_fx_rates_positive CHECK (rate_mxn > 0),
    CONSTRAINT chk_fx_rates_source CHECK (source IN ('banxico', 'manual'))
);

-- Descending date: every read is "the newest row at or before the requested date".
CREATE INDEX IF NOT EXISTS ix_fx_rates_latest ON fx_rates(currency_code, rate_date DESC);

COMMENT ON TABLE currencies IS
    'Catálogo de monedas. Una sola fila con is_base = TRUE; todo se consolida a esa moneda.';
COMMENT ON TABLE fx_rates IS
    'Tasa de cambio en pesos por UNA unidad de la divisa. Sin filas en fines de semana ni feriados.';

COMMIT;
