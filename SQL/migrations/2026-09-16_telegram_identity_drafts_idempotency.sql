-- E1 Telegram: identidad persistente, borradores de gasto e idempotencia durable.
-- Aplicación manual (sin runner automático), igual que el resto de migraciones del repo.

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
    CONSTRAINT uq_telegram_identities_telegram_user_id UNIQUE (telegram_user_id),
    CONSTRAINT fk_telegram_identities_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_telegram_identities_user_active ON telegram_identities(user_id, active);

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
    CONSTRAINT fk_telegram_expense_drafts_identity FOREIGN KEY (telegram_identity_id) REFERENCES telegram_identities(telegram_identity_id) ON DELETE CASCADE,
    CONSTRAINT fk_telegram_expense_drafts_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE SET NULL
);

-- Un solo borrador pendiente por chat.
CREATE UNIQUE INDEX uq_telegram_expense_drafts_pending_chat ON telegram_expense_drafts(chat_id) WHERE status = 'pending';
CREATE INDEX idx_telegram_expense_drafts_expires_at ON telegram_expense_drafts(expires_at);
CREATE INDEX idx_telegram_expense_drafts_identity_status ON telegram_expense_drafts(telegram_identity_id, status);

CREATE TABLE telegram_processed_updates (
    update_id BIGINT PRIMARY KEY,
    telegram_identity_id INT,
    status VARCHAR(20) NOT NULL CHECK (status IN ('processing', 'done', 'failed')),
    attempt_count INT NOT NULL DEFAULT 0,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    CONSTRAINT fk_telegram_processed_updates_identity FOREIGN KEY (telegram_identity_id) REFERENCES telegram_identities(telegram_identity_id) ON DELETE SET NULL
);

CREATE INDEX idx_telegram_processed_updates_status_claimed ON telegram_processed_updates(status, claimed_at);
