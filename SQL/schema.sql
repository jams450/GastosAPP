-- Users Table
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    admin BOOLEAN DEFAULT FALSE,
    session_version INT NOT NULL DEFAULT 1,
    failed_login_count INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

CREATE TABLE user_sessions (
    session_id UUID PRIMARY KEY,
    user_id INT NOT NULL,
    refresh_token_hash VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_session_id UUID,
    ip VARCHAR(64),
    user_agent VARCHAR(512),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Accounts Table
CREATE TABLE accounts (
    account_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#000000',
    active BOOLEAN DEFAULT TRUE,
    start_date DATE NOT NULL,
    is_credit BOOLEAN DEFAULT FALSE,
    due_day INT,
    payment_due_day INT,
    initial_balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    current_balance DECIMAL(10, 2) DEFAULT 0.00,
    earns_interest BOOLEAN DEFAULT FALSE,
    annual_interest_rate DECIMAL(5, 2) DEFAULT 0.00,
    credit_limit DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_accounts_credit_limit
        CHECK (is_credit = FALSE OR active = FALSE OR (credit_limit IS NOT NULL AND credit_limit > 0)),
    CONSTRAINT chk_accounts_payment_due_day_range
        CHECK (payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 31)
);

-- Categories Table
CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    user_id INT,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#000000',
    type VARCHAR(20) DEFAULT 'expense' CHECK (type IN ('income', 'expense', 'transfer')),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Subcategories Table
CREATE TABLE subcategories (
    subcategory_id SERIAL PRIMARY KEY,
    user_id INT,
    category_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    normalized_name VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE,
    UNIQUE (user_id, category_id, normalized_name)
);

-- Merchants Table
CREATE TABLE merchants (
    merchant_id SERIAL PRIMARY KEY,
    user_id INT,
    name VARCHAR(120) NOT NULL,
    normalized_name VARCHAR(120) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    UNIQUE (user_id, normalized_name)
);

-- Tags Table
CREATE TABLE tags (
    tag_id SERIAL PRIMARY KEY,
    user_id INT,
    name VARCHAR(80) NOT NULL,
    normalized_name VARCHAR(80) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    UNIQUE (user_id, normalized_name)
);

-- Category Tags Relation
CREATE TABLE category_tags (
    category_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (category_id, tag_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
);

-- Transactions/Movements Table
CREATE TABLE transactions (
    transaction_id SERIAL PRIMARY KEY,
    account_id INT NOT NULL,
    category_id INT,
    subcategory_id INT,
    merchant_id INT,
    type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense', 'transfer', 'opening_credit', 'transfer_in', 'transfer_out')),
    transfer_group_id UUID,
    amount DECIMAL(15, 2) NOT NULL,
    balance_impact DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    direction VARCHAR(10),
    counterparty_account_id INT,
    description TEXT,
    transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE SET NULL,
    FOREIGN KEY (subcategory_id) REFERENCES subcategories(subcategory_id) ON DELETE SET NULL,
    FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id) ON DELETE SET NULL,
    CONSTRAINT chk_transactions_direction_values
        CHECK (direction IS NULL OR direction IN ('debit', 'credit'))
);

-- Persistent Bancoppel import idempotency claims
CREATE TABLE bancoppel_imported_rows (
    imported_row_id SERIAL PRIMARY KEY,
    account_id INT NOT NULL,
    fingerprint VARCHAR(64) NOT NULL,
    transaction_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    UNIQUE (account_id, fingerprint),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE SET NULL
);

-- Transaction Tags Relation
CREATE TABLE transaction_tags (
    transaction_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (transaction_id, tag_id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
);

-- Billable Parties Catalog (per owner user)
CREATE TABLE billable_parties (
    billable_party_id SERIAL PRIMARY KEY,
    owner_user_id INT NOT NULL,
    linked_user_id INT,
    type VARCHAR(30) NOT NULL CHECK (type IN ('self', 'system_user', 'external_person')),
    display_name VARCHAR(120) NOT NULL,
    normalized_name VARCHAR(120) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    notes VARCHAR(400),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (linked_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    UNIQUE (owner_user_id, normalized_name)
);

-- Transaction Allocations (expense split across parties)
CREATE TABLE transaction_allocations (
    transaction_allocation_id SERIAL PRIMARY KEY,
    transaction_id INT NOT NULL,
    billable_party_id INT NOT NULL,
    allocation_mode VARCHAR(20) NOT NULL CHECK (allocation_mode IN ('percentage', 'amount')),
    allocation_value DECIMAL(15,4) NOT NULL CHECK (allocation_value > 0),
    calculated_amount DECIMAL(15,2) NOT NULL CHECK (calculated_amount >= 0),
    billable_party_snapshot_name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (billable_party_id) REFERENCES billable_parties(billable_party_id) ON DELETE RESTRICT,
    UNIQUE (transaction_id, billable_party_id)
);

-- Indexes for better performance
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_subcategory ON transactions(subcategory_id);
CREATE INDEX idx_transactions_merchant ON transactions(merchant_id);
CREATE INDEX idx_transactions_account_date ON transactions(account_id, transaction_date);
CREATE INDEX idx_transactions_category_date ON transactions(category_id, transaction_date);
CREATE INDEX idx_transactions_subcategory_date ON transactions(subcategory_id, transaction_date);
CREATE INDEX idx_transactions_merchant_date ON transactions(merchant_id, transaction_date);
CREATE INDEX idx_accounts_user ON accounts(user_id);
CREATE INDEX idx_categories_user ON categories(user_id);
CREATE INDEX idx_subcategories_user ON subcategories(user_id);
CREATE INDEX idx_subcategories_category ON subcategories(category_id);
CREATE INDEX idx_merchants_user ON merchants(user_id);
CREATE INDEX idx_tags_user ON tags(user_id);
CREATE INDEX idx_tags_normalized ON tags(normalized_name);
CREATE INDEX idx_transaction_tags_tag ON transaction_tags(tag_id);
CREATE INDEX idx_bancoppel_imported_rows_transaction ON bancoppel_imported_rows(transaction_id);
CREATE INDEX idx_billable_parties_owner ON billable_parties(owner_user_id);
CREATE INDEX idx_billable_parties_owner_type ON billable_parties(owner_user_id, type, active);
CREATE INDEX idx_transaction_allocations_transaction ON transaction_allocations(transaction_id);
CREATE INDEX idx_transaction_allocations_party ON transaction_allocations(billable_party_id);

-- Credit Cycles Table
CREATE TABLE credit_cycles (
    cycle_id SERIAL PRIMARY KEY,
    account_id INT NOT NULL,
    start_at TIMESTAMP WITH TIME ZONE NOT NULL,
    cutoff_at TIMESTAMP WITH TIME ZONE NOT NULL,
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    opening_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
    new_charges DECIMAL(15,2) NOT NULL DEFAULT 0,
    interests_fees DECIMAL(15,2) NOT NULL DEFAULT 0,
    payments_until_cutoff DECIMAL(15,2) NOT NULL DEFAULT 0,
    statement_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
    minimum_due DECIMAL(15,2) NOT NULL DEFAULT 0,
    paid_by_due_date DECIMAL(15,2) NOT NULL DEFAULT 0,
    remaining_by_due_date DECIMAL(15,2) NOT NULL DEFAULT 0,
    state VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (state IN ('Open', 'Closed', 'Settled', 'Overdue')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);

-- Credit Charges Table
CREATE TABLE credit_charges (
    charge_id SERIAL PRIMARY KEY,
    account_id INT NOT NULL,
    source_transaction_id INT NOT NULL UNIQUE,
    cycle_id INT,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    principal_amount DECIMAL(15,2) NOT NULL CHECK (principal_amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'PartiallyPaid', 'Paid', 'Reversed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    FOREIGN KEY (source_transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (cycle_id) REFERENCES credit_cycles(cycle_id) ON DELETE SET NULL
);

-- Credit Installment Plans Table
CREATE TABLE credit_installment_plans (
    plan_id SERIAL PRIMARY KEY,
    account_id INT NOT NULL,
    source_charge_id INT NOT NULL UNIQUE,
    plan_type VARCHAR(20) NOT NULL DEFAULT 'Revolving' CHECK (plan_type IN ('MSI', 'Revolving')),
    months INT NOT NULL DEFAULT 1 CHECK (months >= 1),
    principal_amount DECIMAL(15,2) NOT NULL CHECK (principal_amount > 0),
    monthly_amount_base DECIMAL(15,2) NOT NULL DEFAULT 0,
    rounding_residual DECIMAL(15,2) NOT NULL DEFAULT 0,
    start_cycle_id INT,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Completed', 'Cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    FOREIGN KEY (source_charge_id) REFERENCES credit_charges(charge_id) ON DELETE CASCADE,
    FOREIGN KEY (start_cycle_id) REFERENCES credit_cycles(cycle_id) ON DELETE SET NULL
);

-- Credit Installments Table
CREATE TABLE credit_installments (
    installment_id SERIAL PRIMARY KEY,
    plan_id INT NOT NULL,
    installment_number INT NOT NULL CHECK (installment_number >= 1),
    due_cycle_id INT,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    principal_due DECIMAL(15,2) NOT NULL DEFAULT 0,
    interest_due DECIMAL(15,2) NOT NULL DEFAULT 0,
    fee_due DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_due DECIMAL(15,2) NOT NULL CHECK (total_due > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'PartiallyPaid', 'Paid', 'Overdue')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (plan_id) REFERENCES credit_installment_plans(plan_id) ON DELETE CASCADE,
    FOREIGN KEY (due_cycle_id) REFERENCES credit_cycles(cycle_id) ON DELETE SET NULL,
    UNIQUE (plan_id, installment_number)
);

-- Credit Payments Table
CREATE TABLE credit_payments (
    payment_id SERIAL PRIMARY KEY,
    account_id INT NOT NULL,
    source_transaction_id INT NOT NULL UNIQUE,
    paid_at TIMESTAMP WITH TIME ZONE NOT NULL,
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'Posted' CHECK (status IN ('Posted', 'Voided')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    FOREIGN KEY (source_transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE
);

-- Installment Allocations Table
CREATE TABLE installment_allocations (
    allocation_id SERIAL PRIMARY KEY,
    payment_id INT NOT NULL,
    installment_id INT NOT NULL,
    allocated_amount DECIMAL(15,2) NOT NULL CHECK (allocated_amount > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (payment_id) REFERENCES credit_payments(payment_id) ON DELETE CASCADE,
    FOREIGN KEY (installment_id) REFERENCES credit_installments(installment_id) ON DELETE CASCADE
);

-- Credit domain indexes
CREATE UNIQUE INDEX uq_credit_cycles_account_cutoff ON credit_cycles(account_id, cutoff_at);
CREATE INDEX idx_credit_cycles_account_due ON credit_cycles(account_id, due_at);
CREATE INDEX idx_credit_charges_account_occurred ON credit_charges(account_id, occurred_at);
CREATE INDEX idx_credit_charges_account_status ON credit_charges(account_id, status);
CREATE INDEX idx_credit_installment_plans_account_status ON credit_installment_plans(account_id, status);
CREATE INDEX idx_credit_installments_due_cycle_status ON credit_installments(due_cycle_id, status);
CREATE INDEX idx_credit_payments_account_paid_at ON credit_payments(account_id, paid_at);
CREATE INDEX idx_installment_allocations_payment ON installment_allocations(payment_id);
CREATE INDEX idx_installment_allocations_installment ON installment_allocations(installment_id);

-- Telegram Identities (per authorized Telegram user)
CREATE TABLE telegram_identities (
    telegram_identity_id SERIAL PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL,
    telegram_chat_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    UNIQUE (telegram_user_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_telegram_identities_user_active ON telegram_identities(user_id, active);

-- Telegram Expense Drafts (no escribe transactions hasta confirmar)
CREATE TABLE telegram_expense_drafts (
    draft_id UUID PRIMARY KEY,
    telegram_identity_id INT NOT NULL,
    chat_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
    intent VARCHAR(20) NOT NULL CHECK (intent IN ('expense')),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    transaction_date TIMESTAMPTZ NOT NULL,
    account_id INT,
    category_id INT,
    subcategory_id INT,
    merchant_id INT,
    raw_account_name VARCHAR(150),
    raw_category_name VARCHAR(150),
    raw_subcategory_name VARCHAR(150),
    raw_merchant_name VARCHAR(150),
    description VARCHAR(500),
    source VARCHAR(20) NOT NULL CHECK (source IN ('manual', 'ai')),
    expires_at TIMESTAMPTZ NOT NULL,
    confirmed_at TIMESTAMPTZ,
    transaction_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (telegram_identity_id) REFERENCES telegram_identities(telegram_identity_id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE SET NULL
);

-- Telegram Processed Updates (idempotencia durable: claim atómico, lease, ownership y attempt count)
CREATE TABLE telegram_processed_updates (
    update_id BIGINT PRIMARY KEY,
    telegram_identity_id INT,
    status VARCHAR(20) NOT NULL CHECK (status IN ('processing', 'done', 'failed')),
    attempt_count INT NOT NULL DEFAULT 0,
    claim_token UUID NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    FOREIGN KEY (telegram_identity_id) REFERENCES telegram_identities(telegram_identity_id) ON DELETE SET NULL
);

-- Telegram indexes
CREATE UNIQUE INDEX uq_telegram_expense_drafts_pending_chat ON telegram_expense_drafts(chat_id) WHERE status = 'pending';
CREATE INDEX idx_telegram_expense_drafts_expires_at ON telegram_expense_drafts(expires_at);
CREATE INDEX idx_telegram_expense_drafts_identity_status ON telegram_expense_drafts(telegram_identity_id, status);
CREATE INDEX idx_telegram_processed_updates_status_claimed ON telegram_processed_updates(status, claimed_at);

-- Fase 2 — Presupuestos mensuales y alertas por Telegram (solo persistencia).
-- Idempotente: replica de SQL/migrations/2026-09-16_fase2_budgets_alerts.sql para instalaciones nuevas.

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
-- no es mapeable con HasIndex (por eso vive únicamente aquí y en la migración).
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

-- Dashboard financiero (Fase 1): índices de agregación y overview por cuenta activa.
-- Réplica idempotente de SQL/migrations/2026-09-17_dashboard_active_accounts_and_credit_snapshot.sql
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_group_transaction_id
    ON transactions(transfer_group_id, transaction_id)
    WHERE transfer_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_installments_status
    ON credit_installments(status);

CREATE INDEX IF NOT EXISTS idx_credit_payments_status
    ON credit_payments(status);

-- Dashboard financiero (Fase 1): overview por cuenta, sólo cuentas activas.
-- Réplica idempotente de SQL/migrations/2026-09-17_dashboard_active_accounts_and_credit_snapshot.sql
CREATE OR REPLACE FUNCTION fn_dashboard_credit_overview(
    p_user_id INT,
    p_month_start TIMESTAMPTZ,
    p_next_month_start TIMESTAMPTZ,
    p_year_value INT,
    p_month_value INT,
    p_days_in_month INT,
    p_previous_year INT,
    p_previous_month INT,
    p_previous_days_in_month INT
)
RETURNS TABLE (
    "AccountId" INT,
    "Name" VARCHAR,
    "Active" BOOLEAN,
    "IsCredit" BOOLEAN,
    "CutoffDay" INT,
    "PaymentDueDay" INT,
    "InitialBalance" NUMERIC,
    "CurrentBalance" NUMERIC,
    "OpeningBalance" NUMERIC,
    "MonthIncome" NUMERIC,
    "MonthExpense" NUMERIC,
    "MonthTransferIn" NUMERIC,
    "MonthTransferOut" NUMERIC,
    "MonthNet" NUMERIC,
    "ClosingBalance" NUMERIC,
    "CreditLimit" NUMERIC,
    "PeriodStart" DATE,
    "PeriodEnd" DATE,
    "PeriodSpent" NUMERIC,
    "EstimatedCutoffCharges" NUMERIC,
    "CutoffPayments" NUMERIC,
    "CutoffPending" NUMERIC,
    "MsiOutstanding" NUMERIC,
    "NormalOutstanding" NUMERIC
)
LANGUAGE sql
AS $$
WITH accounts_scope AS (
    SELECT
        a.account_id,
        a.name,
        a.active,
        a.is_credit,
        a.due_day,
        a.payment_due_day,
        a.initial_balance,
        a.current_balance,
        a.credit_limit
    FROM accounts a
    WHERE a.user_id = p_user_id
      AND a.active = TRUE
),
tx_scope AS (
    SELECT
        t.transaction_id,
        t.account_id,
        t.type,
        t.transfer_group_id,
        t.amount,
        t.balance_impact,
        t.transaction_date
    FROM transactions t
    INNER JOIN accounts_scope a ON a.account_id = t.account_id
    WHERE t.transaction_date < p_next_month_start
),
transfer_rank AS (
    SELECT
        t.transaction_id,
        row_number() OVER (PARTITION BY t.transfer_group_id ORDER BY t.transaction_id) AS row_num,
        count(*) OVER (PARTITION BY t.transfer_group_id) AS group_size
    FROM tx_scope t
    WHERE lower(t.type) = 'transfer' AND t.transfer_group_id IS NOT NULL
),
tx_with_impact AS (
    SELECT
        t.account_id,
        t.type,
        t.amount,
        t.transaction_date,
        CASE
            WHEN t.balance_impact <> 0 THEN t.balance_impact
            WHEN lower(t.type) = 'income' THEN t.amount
            WHEN lower(t.type) = 'expense' THEN t.amount * -1
            WHEN lower(t.type) = 'transfer' AND t.transfer_group_id IS NULL THEN t.amount
            WHEN lower(t.type) = 'transfer' THEN
                CASE
                    WHEN coalesce(r.group_size, 0) < 2 THEN t.amount
                    WHEN r.row_num = 1 THEN t.amount * -1
                    ELSE t.amount
                END
            ELSE 0
        END AS impact
    FROM tx_scope t
    LEFT JOIN transfer_rank r ON r.transaction_id = t.transaction_id
),
month_agg AS (
    SELECT
        a.account_id,
        coalesce(sum(CASE WHEN t.transaction_date < p_month_start THEN t.impact ELSE 0 END), 0) AS prior_impact,
        coalesce(sum(CASE
            WHEN t.transaction_date >= p_month_start
             AND t.transaction_date < p_next_month_start
              AND lower(t.type) = 'income'
             THEN t.amount
            ELSE 0
        END), 0) AS month_income,
        coalesce(sum(CASE
            WHEN t.transaction_date >= p_month_start
             AND t.transaction_date < p_next_month_start
             AND lower(t.type) = 'expense'
            THEN t.amount
            ELSE 0
        END), 0) AS month_expense,
        coalesce(sum(CASE
            WHEN t.transaction_date >= p_month_start
             AND t.transaction_date < p_next_month_start
             AND lower(t.type) = 'transfer'
             AND t.impact > 0
            THEN t.impact
            ELSE 0
        END), 0) AS month_transfer_in,
        coalesce(sum(CASE
            WHEN t.transaction_date >= p_month_start
             AND t.transaction_date < p_next_month_start
             AND lower(t.type) = 'transfer'
             AND t.impact < 0
            THEN abs(t.impact)
            ELSE 0
        END), 0) AS month_transfer_out,
        coalesce(sum(CASE WHEN t.transaction_date >= p_month_start AND t.transaction_date < p_next_month_start THEN t.impact ELSE 0 END), 0) AS month_net
    FROM accounts_scope a
    LEFT JOIN tx_with_impact t ON t.account_id = a.account_id
    GROUP BY a.account_id
),
credit_bounds_base AS (
    SELECT
        a.account_id,
        CASE WHEN a.is_credit THEN make_date(p_year_value, p_month_value, LEAST(GREATEST(coalesce(a.due_day, p_days_in_month), 1), p_days_in_month)) END AS period_end,
        CASE WHEN a.is_credit THEN (make_date(p_previous_year, p_previous_month, LEAST(GREATEST(coalesce(a.due_day, p_previous_days_in_month), 1), p_previous_days_in_month)) + INTERVAL '1 day')::date END AS period_start,
        CASE WHEN a.is_credit THEN GREATEST(coalesce(a.payment_due_day, p_days_in_month), 1) END AS payment_day,
        CASE WHEN a.is_credit THEN LEAST(GREATEST(coalesce(a.due_day, p_days_in_month), 1), p_days_in_month) END AS cutoff_day
    FROM accounts_scope a
),
credit_bounds AS (
    SELECT
        b.account_id,
        b.period_start,
        b.period_end,
        CASE WHEN b.period_end IS NOT NULL THEN (p.previous_due + INTERVAL '1 day')::date END AS payment_start,
        CASE WHEN b.period_end IS NOT NULL THEN p.current_due END AS payment_end
    FROM credit_bounds_base b
    CROSS JOIN LATERAL (
        SELECT CASE WHEN b.payment_day <= b.cutoff_day
            THEN (b.period_end + INTERVAL '1 month')::date
            ELSE b.period_end
        END AS due_month
    ) d
    CROSS JOIN LATERAL (
        SELECT
            make_date(
                EXTRACT(YEAR FROM due_month)::int,
                EXTRACT(MONTH FROM due_month)::int,
                LEAST(b.payment_day, EXTRACT(DAY FROM (date_trunc('month', due_month) + INTERVAL '1 month' - INTERVAL '1 day'))::int)
            ) AS current_due,
            make_date(
                EXTRACT(YEAR FROM (due_month - INTERVAL '1 month'))::int,
                EXTRACT(MONTH FROM (due_month - INTERVAL '1 month'))::int,
                LEAST(b.payment_day, EXTRACT(DAY FROM (date_trunc('month', due_month - INTERVAL '1 month') + INTERVAL '1 month' - INTERVAL '1 day'))::int)
            ) AS previous_due
    ) p
),
msi_source_transactions AS (
    SELECT DISTINCT
        cc.source_transaction_id AS transaction_id
    FROM credit_charges cc
    INNER JOIN credit_installment_plans cip ON cip.source_charge_id = cc.charge_id
    WHERE cip.plan_type = 'MSI'
),
credit_spent AS (
    SELECT
        cb.account_id,
        coalesce(chg.regular_cutoff_charges, 0) + coalesce(msi.msi_cutoff_charges, 0) AS period_spent,
        coalesce(chg.regular_cutoff_charges, 0) + coalesce(msi.msi_cutoff_charges, 0) AS estimated_cutoff_charges,
        coalesce(pay.cutoff_payments, 0) AS cutoff_payments,
        GREATEST((coalesce(chg.regular_cutoff_charges, 0) + coalesce(msi.msi_cutoff_charges, 0)) - coalesce(pay.cutoff_payments, 0), 0) AS cutoff_pending
    FROM credit_bounds cb
    LEFT JOIN (
        SELECT
            cb2.account_id,
            coalesce(sum(CASE
                WHEN lower(t.type) = 'expense' AND mst.transaction_id IS NULL THEN t.amount
                WHEN lower(t.type) = 'transfer' AND t.balance_impact < 0 THEN abs(t.balance_impact)
                ELSE 0
            END), 0) AS regular_cutoff_charges
        FROM credit_bounds cb2
        LEFT JOIN transactions t
            ON t.account_id = cb2.account_id
           AND cb2.period_start IS NOT NULL
           AND cb2.period_end IS NOT NULL
           AND t.transaction_date >= cb2.period_start
           AND t.transaction_date < (cb2.period_end + INTERVAL '1 day')
        LEFT JOIN msi_source_transactions mst ON mst.transaction_id = t.transaction_id
        GROUP BY cb2.account_id
    ) chg ON chg.account_id = cb.account_id
    LEFT JOIN (
        SELECT
            cbm.account_id,
            coalesce(sum(GREATEST(ci.total_due - coalesce(ip.allocated_total, 0), 0)), 0) AS msi_cutoff_charges
        FROM credit_bounds cbm
        INNER JOIN credit_installment_plans cip
            ON cip.account_id = cbm.account_id
           AND cip.plan_type = 'MSI'
        INNER JOIN credit_installments ci
            ON ci.plan_id = cip.plan_id
           AND ci.status IN ('Open', 'PartiallyPaid', 'Overdue')
        LEFT JOIN credit_cycles dc ON dc.cycle_id = ci.due_cycle_id
        LEFT JOIN (
            SELECT
                ia.installment_id,
                coalesce(sum(ia.allocated_amount), 0) AS allocated_total
            FROM installment_allocations ia
            INNER JOIN credit_payments cp ON cp.payment_id = ia.payment_id AND cp.status = 'Posted'
            GROUP BY ia.installment_id
        ) ip ON ip.installment_id = ci.installment_id
        WHERE cbm.payment_start IS NOT NULL
          AND cbm.payment_end IS NOT NULL
          AND (coalesce(dc.due_at, ci.due_date) AT TIME ZONE 'UTC')::date >= cbm.payment_start
          AND (coalesce(dc.due_at, ci.due_date) AT TIME ZONE 'UTC')::date < (cbm.payment_end + INTERVAL '1 day')
        GROUP BY cbm.account_id
    ) msi ON msi.account_id = cb.account_id
    LEFT JOIN (
        SELECT
            cb3.account_id,
            coalesce(sum(ia.allocated_amount), 0) AS cutoff_payments
        FROM credit_bounds cb3
        LEFT JOIN credit_installment_plans cip
            ON cip.account_id = cb3.account_id
           AND cip.plan_type IN ('MSI', 'Revolving')
        LEFT JOIN credit_installments ci
            ON ci.plan_id = cip.plan_id
           AND ci.status IN ('Open', 'PartiallyPaid', 'Paid', 'Overdue')
        LEFT JOIN credit_cycles dc
            ON dc.cycle_id = ci.due_cycle_id
        LEFT JOIN installment_allocations ia
            ON ia.installment_id = ci.installment_id
        INNER JOIN credit_payments cp
            ON cp.payment_id = ia.payment_id
           AND cp.status = 'Posted'
        WHERE cb3.payment_end IS NOT NULL
          AND (coalesce(dc.due_at, ci.due_date) AT TIME ZONE 'UTC')::date = cb3.payment_end
        GROUP BY cb3.account_id
    ) pay ON pay.account_id = cb.account_id
),
installment_paid AS (
    SELECT
        ia.installment_id,
        coalesce(sum(ia.allocated_amount), 0) AS allocated_total
    FROM installment_allocations ia
    INNER JOIN credit_payments cp ON cp.payment_id = ia.payment_id AND cp.status = 'Posted'
    GROUP BY ia.installment_id
),
credit_installment_breakdown AS (
    SELECT
        cip.account_id,
        coalesce(sum(CASE
            WHEN cip.plan_type = 'MSI' THEN GREATEST(ci.total_due - coalesce(ip.allocated_total, 0), 0)
            ELSE 0
        END), 0) AS msi_outstanding,
        coalesce(sum(CASE
            WHEN cip.plan_type = 'Revolving' THEN GREATEST(ci.total_due - coalesce(ip.allocated_total, 0), 0)
            ELSE 0
        END), 0) AS normal_outstanding
    FROM credit_installments ci
    INNER JOIN credit_installment_plans cip ON cip.plan_id = ci.plan_id
    INNER JOIN accounts_scope a ON a.account_id = cip.account_id AND a.is_credit = TRUE
    LEFT JOIN installment_paid ip ON ip.installment_id = ci.installment_id
    WHERE ci.status IN ('Open', 'PartiallyPaid', 'Overdue')
    GROUP BY cip.account_id
)
SELECT
    a.account_id AS "AccountId",
    a.name AS "Name",
    a.active AS "Active",
    a.is_credit AS "IsCredit",
    a.due_day AS "CutoffDay",
    a.payment_due_day AS "PaymentDueDay",
    a.initial_balance AS "InitialBalance",
    a.current_balance AS "CurrentBalance",
    (a.initial_balance + coalesce(m.prior_impact, 0)) AS "OpeningBalance",
    coalesce(m.month_income, 0) AS "MonthIncome",
    coalesce(m.month_expense, 0) AS "MonthExpense",
    coalesce(m.month_transfer_in, 0) AS "MonthTransferIn",
    coalesce(m.month_transfer_out, 0) AS "MonthTransferOut",
    coalesce(m.month_net, 0) AS "MonthNet",
    (a.initial_balance + coalesce(m.prior_impact, 0) + coalesce(m.month_net, 0)) AS "ClosingBalance",
    a.credit_limit AS "CreditLimit",
    cb.period_start AS "PeriodStart",
    cb.period_end AS "PeriodEnd",
    coalesce(cs.period_spent, 0) AS "PeriodSpent",
    coalesce(cs.estimated_cutoff_charges, 0) AS "EstimatedCutoffCharges",
    coalesce(cs.cutoff_payments, 0) AS "CutoffPayments",
    coalesce(cs.cutoff_pending, 0) AS "CutoffPending",
    coalesce(cib.msi_outstanding, 0) AS "MsiOutstanding",
    coalesce(cib.normal_outstanding, 0) AS "NormalOutstanding"
FROM accounts_scope a
LEFT JOIN month_agg m ON m.account_id = a.account_id
LEFT JOIN credit_bounds cb ON cb.account_id = a.account_id
LEFT JOIN credit_spent cs ON cs.account_id = a.account_id
LEFT JOIN credit_installment_breakdown cib ON cib.account_id = a.account_id
ORDER BY a.name;
$$;

COMMENT ON FUNCTION fn_dashboard_credit_overview(INT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, INT, INT, INT, INT)
IS 'Dashboard credit overview (due cycle alignment) limited to active accounts';

