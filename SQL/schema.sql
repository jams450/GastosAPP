-- Users Table
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    admin BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
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
    FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id) ON DELETE SET NULL
);

-- Transaction Tags Relation
CREATE TABLE transaction_tags (
    transaction_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (transaction_id, tag_id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
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
