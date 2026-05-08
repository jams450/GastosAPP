BEGIN;

CREATE TABLE IF NOT EXISTS billable_parties (
    billable_party_id SERIAL PRIMARY KEY,
    owner_user_id INT NOT NULL,
    linked_user_id INT,
    type VARCHAR(30) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    normalized_name VARCHAR(120) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    notes VARCHAR(400),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_billable_parties_owner_user
        FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_billable_parties_linked_user
        FOREIGN KEY (linked_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT ck_billable_parties_type
        CHECK (type IN ('self', 'system_user', 'external_person'))
);

CREATE TABLE IF NOT EXISTS transaction_allocations (
    transaction_allocation_id SERIAL PRIMARY KEY,
    transaction_id INT NOT NULL,
    billable_party_id INT NOT NULL,
    allocation_mode VARCHAR(20) NOT NULL,
    allocation_value DECIMAL(15,4) NOT NULL,
    calculated_amount DECIMAL(15,2) NOT NULL,
    billable_party_snapshot_name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_transaction_allocations_transaction
        FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    CONSTRAINT fk_transaction_allocations_billable_party
        FOREIGN KEY (billable_party_id) REFERENCES billable_parties(billable_party_id) ON DELETE RESTRICT,
    CONSTRAINT ck_transaction_allocations_mode
        CHECK (allocation_mode IN ('percentage', 'amount')),
    CONSTRAINT ck_transaction_allocations_value
        CHECK (allocation_value > 0),
    CONSTRAINT ck_transaction_allocations_calculated_amount
        CHECK (calculated_amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_billable_parties_owner_normalized
    ON billable_parties(owner_user_id, normalized_name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_allocations_transaction_party
    ON transaction_allocations(transaction_id, billable_party_id);

CREATE INDEX IF NOT EXISTS idx_billable_parties_owner
    ON billable_parties(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_billable_parties_owner_type_active
    ON billable_parties(owner_user_id, type, active);

CREATE INDEX IF NOT EXISTS idx_transaction_allocations_transaction
    ON transaction_allocations(transaction_id);

CREATE INDEX IF NOT EXISTS idx_transaction_allocations_billable_party
    ON transaction_allocations(billable_party_id);

-- Ensure each user has a SELF billable party
INSERT INTO billable_parties (
    owner_user_id,
    linked_user_id,
    type,
    display_name,
    normalized_name,
    active,
    created_at
)
SELECT
    u.user_id,
    u.user_id,
    'self',
    COALESCE(NULLIF(TRIM(u.name), ''), 'Propio') AS display_name,
    LOWER(COALESCE(NULLIF(TRIM(u.name), ''), 'Propio')) AS normalized_name,
    TRUE,
    NOW()
FROM users u
WHERE NOT EXISTS (
    SELECT 1
    FROM billable_parties bp
    WHERE bp.owner_user_id = u.user_id
      AND bp.type = 'self'
);

-- Backfill historical expenses with 100% SELF allocation
INSERT INTO transaction_allocations (
    transaction_id,
    billable_party_id,
    allocation_mode,
    allocation_value,
    calculated_amount,
    billable_party_snapshot_name,
    created_at
)
SELECT
    t.transaction_id,
    bp.billable_party_id,
    'percentage',
    100,
    t.amount,
    bp.display_name,
    NOW()
FROM transactions t
INNER JOIN accounts a ON a.account_id = t.account_id
INNER JOIN billable_parties bp ON bp.owner_user_id = a.user_id
                              AND bp.type = 'self'
                              AND bp.active = TRUE
WHERE LOWER(t.type) = 'expense'
  AND NOT EXISTS (
      SELECT 1
      FROM transaction_allocations ta
      WHERE ta.transaction_id = t.transaction_id
  );

COMMIT;

ANALYZE billable_parties;
ANALYZE transaction_allocations;
