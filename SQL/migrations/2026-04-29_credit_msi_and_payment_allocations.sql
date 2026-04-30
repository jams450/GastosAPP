BEGIN;

CREATE TABLE IF NOT EXISTS credit_cycles (
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
    state VARCHAR(20) NOT NULL DEFAULT 'Open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_credit_cycles_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    CONSTRAINT ck_credit_cycles_state
        CHECK (state IN ('Open', 'Closed', 'Settled', 'Overdue'))
);

CREATE TABLE IF NOT EXISTS credit_charges (
    charge_id SERIAL PRIMARY KEY,
    account_id INT NOT NULL,
    source_transaction_id INT NOT NULL,
    cycle_id INT,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    principal_amount DECIMAL(15,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_credit_charges_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    CONSTRAINT fk_credit_charges_source_transaction
        FOREIGN KEY (source_transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    CONSTRAINT fk_credit_charges_cycle
        FOREIGN KEY (cycle_id) REFERENCES credit_cycles(cycle_id) ON DELETE SET NULL,
    CONSTRAINT ck_credit_charges_status
        CHECK (status IN ('Open', 'PartiallyPaid', 'Paid', 'Reversed')),
    CONSTRAINT ck_credit_charges_principal_positive
        CHECK (principal_amount > 0)
);

CREATE TABLE IF NOT EXISTS credit_installment_plans (
    plan_id SERIAL PRIMARY KEY,
    account_id INT NOT NULL,
    source_charge_id INT NOT NULL,
    plan_type VARCHAR(20) NOT NULL DEFAULT 'Revolving',
    months INT NOT NULL DEFAULT 1,
    principal_amount DECIMAL(15,2) NOT NULL,
    monthly_amount_base DECIMAL(15,2) NOT NULL DEFAULT 0,
    rounding_residual DECIMAL(15,2) NOT NULL DEFAULT 0,
    start_cycle_id INT,
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_credit_installment_plans_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    CONSTRAINT fk_credit_installment_plans_source_charge
        FOREIGN KEY (source_charge_id) REFERENCES credit_charges(charge_id) ON DELETE CASCADE,
    CONSTRAINT fk_credit_installment_plans_start_cycle
        FOREIGN KEY (start_cycle_id) REFERENCES credit_cycles(cycle_id) ON DELETE SET NULL,
    CONSTRAINT ck_credit_installment_plans_type
        CHECK (plan_type IN ('MSI', 'Revolving')),
    CONSTRAINT ck_credit_installment_plans_status
        CHECK (status IN ('Active', 'Completed', 'Cancelled')),
    CONSTRAINT ck_credit_installment_plans_months
        CHECK (months >= 1),
    CONSTRAINT ck_credit_installment_plans_principal_positive
        CHECK (principal_amount > 0)
);

CREATE TABLE IF NOT EXISTS credit_installments (
    installment_id SERIAL PRIMARY KEY,
    plan_id INT NOT NULL,
    installment_number INT NOT NULL,
    due_cycle_id INT,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    principal_due DECIMAL(15,2) NOT NULL DEFAULT 0,
    interest_due DECIMAL(15,2) NOT NULL DEFAULT 0,
    fee_due DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_due DECIMAL(15,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_credit_installments_plan
        FOREIGN KEY (plan_id) REFERENCES credit_installment_plans(plan_id) ON DELETE CASCADE,
    CONSTRAINT fk_credit_installments_due_cycle
        FOREIGN KEY (due_cycle_id) REFERENCES credit_cycles(cycle_id) ON DELETE SET NULL,
    CONSTRAINT ck_credit_installments_status
        CHECK (status IN ('Open', 'PartiallyPaid', 'Paid', 'Overdue')),
    CONSTRAINT ck_credit_installments_number_positive
        CHECK (installment_number >= 1),
    CONSTRAINT ck_credit_installments_total_positive
        CHECK (total_due > 0)
);

CREATE TABLE IF NOT EXISTS credit_payments (
    payment_id SERIAL PRIMARY KEY,
    account_id INT NOT NULL,
    source_transaction_id INT NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Posted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_credit_payments_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    CONSTRAINT fk_credit_payments_source_transaction
        FOREIGN KEY (source_transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    CONSTRAINT ck_credit_payments_status
        CHECK (status IN ('Posted', 'Voided')),
    CONSTRAINT ck_credit_payments_amount_positive
        CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS installment_allocations (
    allocation_id SERIAL PRIMARY KEY,
    payment_id INT NOT NULL,
    installment_id INT NOT NULL,
    allocated_amount DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_installment_allocations_payment
        FOREIGN KEY (payment_id) REFERENCES credit_payments(payment_id) ON DELETE CASCADE,
    CONSTRAINT fk_installment_allocations_installment
        FOREIGN KEY (installment_id) REFERENCES credit_installments(installment_id) ON DELETE CASCADE,
    CONSTRAINT ck_installment_allocations_positive
        CHECK (allocated_amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_cycles_account_cutoff
    ON credit_cycles(account_id, cutoff_at);

CREATE INDEX IF NOT EXISTS idx_credit_cycles_account_due
    ON credit_cycles(account_id, due_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_charges_source_transaction
    ON credit_charges(source_transaction_id);

CREATE INDEX IF NOT EXISTS idx_credit_charges_account_occurred
    ON credit_charges(account_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_credit_charges_account_status
    ON credit_charges(account_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_installment_plans_source_charge
    ON credit_installment_plans(source_charge_id);

CREATE INDEX IF NOT EXISTS idx_credit_installment_plans_account_status
    ON credit_installment_plans(account_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_installments_plan_number
    ON credit_installments(plan_id, installment_number);

CREATE INDEX IF NOT EXISTS idx_credit_installments_due_cycle_status
    ON credit_installments(due_cycle_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_payments_source_transaction
    ON credit_payments(source_transaction_id);

CREATE INDEX IF NOT EXISTS idx_credit_payments_account_paid_at
    ON credit_payments(account_id, paid_at);

CREATE INDEX IF NOT EXISTS idx_installment_allocations_payment
    ON installment_allocations(payment_id);

CREATE INDEX IF NOT EXISTS idx_installment_allocations_installment
    ON installment_allocations(installment_id);

COMMIT;

ANALYZE credit_cycles;
ANALYZE credit_charges;
ANALYZE credit_installment_plans;
ANALYZE credit_installments;
ANALYZE credit_payments;
ANALYZE installment_allocations;
