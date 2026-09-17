-- Fase 2 — Presupuestos mensuales y alertas por Telegram (solo persistencia).
-- DDL idempotente y re-ejecutable. Sin datos, sin secretos.
-- Orden: catalog_rules -> budgets -> budget_thresholds -> alert_deliveries -> alert_outbox.

BEGIN;

-- Reglas deterministas de categorización (match textual normalizado, destino XOR).
CREATE TABLE IF NOT EXISTS catalog_rules (
    rule_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(120) NOT NULL,
    match_type VARCHAR(20) NOT NULL CHECK (match_type IN ('contains', 'equals', 'starts_with')),
    match_value VARCHAR(200) NOT NULL,
    target_category_id INT,
    target_subcategory_id INT,
    priority INT NOT NULL DEFAULT 100,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_catalog_rules_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_catalog_rules_target_category
        FOREIGN KEY (target_category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
    CONSTRAINT fk_catalog_rules_target_subcategory
        FOREIGN KEY (target_subcategory_id) REFERENCES subcategories(subcategory_id) ON DELETE RESTRICT,
    CONSTRAINT ck_catalog_rules_target_xor
        CHECK ((target_category_id IS NULL) <> (target_subcategory_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_catalog_rules_user_active_priority
    ON catalog_rules(user_id, active, priority);

-- Presupuestos mensuales en MXN. scope XOR: categoría o subcategoría, nunca ambos ni ninguno.
CREATE TABLE IF NOT EXISTS budgets (
    budget_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    period_key CHAR(7) NOT NULL,
    name VARCHAR(120) NOT NULL,
    category_id INT,
    subcategory_id INT,
    amount_mxn DECIMAL(15, 2) NOT NULL CHECK (amount_mxn > 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_budgets_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_budgets_category
        FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
    CONSTRAINT fk_budgets_subcategory
        FOREIGN KEY (subcategory_id) REFERENCES subcategories(subcategory_id) ON DELETE RESTRICT,
    CONSTRAINT ck_budgets_scope
        CHECK ((category_id IS NULL) <> (subcategory_id IS NULL)),
    CONSTRAINT ck_budgets_period_key
        CHECK (period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

-- Idempotencia del presupuesto por (usuario, periodo, scope). Índice de expresión: solo SQL,
-- no es mapeable con HasIndex (por eso vive únicamente aquí y en schema.sql).
CREATE UNIQUE INDEX IF NOT EXISTS ux_budgets_user_period_scope
    ON budgets (user_id, period_key, COALESCE(category_id, 0), COALESCE(subcategory_id, 0));

-- Umbrales configurables por presupuesto.
CREATE TABLE IF NOT EXISTS budget_thresholds (
    threshold_id SERIAL PRIMARY KEY,
    budget_id INT NOT NULL,
    name VARCHAR(60) NOT NULL,
    percent DECIMAL(5, 2) NOT NULL CHECK (percent > 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_budget_thresholds_budget
        FOREIGN KEY (budget_id) REFERENCES budgets(budget_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_thresholds_budget_percent
    ON budget_thresholds(budget_id, percent);

-- Entregas de alerta: historial inmutable por (presupuesto, umbral, periodo).
-- budget_id y threshold_id son RESTRICT para no perder historial ya notificado
-- (borrar un presupuesto con entregas falla; primero hay que archivar/eliminar entregas).
CREATE TABLE IF NOT EXISTS alert_deliveries (
    delivery_id SERIAL PRIMARY KEY,
    budget_id INT NOT NULL,
    threshold_id INT NOT NULL,
    user_id INT NOT NULL,
    period_key CHAR(7) NOT NULL,
    threshold_percent DECIMAL(5, 2) NOT NULL CHECK (threshold_percent > 0),
    budget_amount DECIMAL(15, 2) NOT NULL CHECK (budget_amount > 0),
    spent_amount DECIMAL(15, 2) NOT NULL CHECK (spent_amount >= 0),
    percent_used DECIMAL(7, 2) NOT NULL CHECK (percent_used >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_alert_deliveries_budget
        FOREIGN KEY (budget_id) REFERENCES budgets(budget_id) ON DELETE RESTRICT,
    CONSTRAINT fk_alert_deliveries_threshold
        FOREIGN KEY (threshold_id) REFERENCES budget_thresholds(threshold_id) ON DELETE RESTRICT,
    CONSTRAINT fk_alert_deliveries_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT ck_alert_deliveries_period_key
        CHECK (period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

-- Candado de idempotencia del evaluador.
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_deliveries_budget_threshold_period
    ON alert_deliveries(budget_id, threshold_id, period_key);

CREATE INDEX IF NOT EXISTS idx_alert_deliveries_user_period
    ON alert_deliveries(user_id, period_key);

-- Outbox transaccional: una fila por entrega, drenada por el BackgroundService.
CREATE TABLE IF NOT EXISTS alert_outbox (
    outbox_id SERIAL PRIMARY KEY,
    delivery_id INT NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'telegram' CHECK (channel = 'telegram'),
    payload TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    last_error VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_alert_outbox_delivery
        FOREIGN KEY (delivery_id) REFERENCES alert_deliveries(delivery_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_outbox_delivery
    ON alert_outbox(delivery_id);

CREATE INDEX IF NOT EXISTS idx_alert_outbox_status_next_attempt
    ON alert_outbox(status, next_attempt_at);

COMMIT;

ANALYZE catalog_rules;
ANALYZE budgets;
ANALYZE budget_thresholds;
ANALYZE alert_deliveries;
ANALYZE alert_outbox;
