ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS initial_balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00;

UPDATE accounts
SET initial_balance = COALESCE(current_balance, 0.00)
WHERE initial_balance = 0.00;

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS balance_impact DECIMAL(15, 2),
    ADD COLUMN IF NOT EXISTS direction VARCHAR(10),
    ADD COLUMN IF NOT EXISTS counterparty_account_id INT;

UPDATE transactions
SET balance_impact = CASE
        WHEN type = 'income' THEN amount
        WHEN type = 'expense' THEN amount * -1
        ELSE balance_impact
    END,
    direction = CASE
        WHEN type = 'income' THEN 'credit'
        WHEN type = 'expense' THEN 'debit'
        ELSE direction
    END,
    counterparty_account_id = CASE
        WHEN type IN ('income', 'expense') THEN NULL
        ELSE counterparty_account_id
    END
WHERE type IN ('income', 'expense');

CREATE TABLE IF NOT EXISTS transactions_backfill_issues
(
    issue_id SERIAL PRIMARY KEY,
    transfer_group_id UUID,
    issue_type VARCHAR(100) NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO transactions_backfill_issues (transfer_group_id, issue_type, details)
SELECT transfer_group_id,
       'transfer_group_invalid_count',
       CONCAT('Expected 2 transactions but found ', cnt)
FROM (
    SELECT transfer_group_id, COUNT(*) AS cnt
    FROM transactions
    WHERE type = 'transfer'
      AND transfer_group_id IS NOT NULL
    GROUP BY transfer_group_id
) grouped
WHERE cnt <> 2;

WITH ranked_transfers AS (
    SELECT
        t.transaction_id,
        t.amount,
        ROW_NUMBER() OVER (PARTITION BY t.transfer_group_id ORDER BY t.transaction_id) AS rn,
        COUNT(*) OVER (PARTITION BY t.transfer_group_id) AS cnt,
        LEAD(t.account_id) OVER (PARTITION BY t.transfer_group_id ORDER BY t.transaction_id) AS next_account_id,
        LAG(t.account_id) OVER (PARTITION BY t.transfer_group_id ORDER BY t.transaction_id) AS previous_account_id
    FROM transactions t
    WHERE t.type = 'transfer'
      AND t.transfer_group_id IS NOT NULL
)
UPDATE transactions tx
SET balance_impact = CASE WHEN r.rn = 1 THEN r.amount * -1 ELSE r.amount END,
    direction = CASE WHEN r.rn = 1 THEN 'debit' ELSE 'credit' END,
    counterparty_account_id = CASE WHEN r.rn = 1 THEN r.next_account_id ELSE r.previous_account_id END
FROM ranked_transfers r
WHERE tx.transaction_id = r.transaction_id
  AND r.cnt = 2;

UPDATE transactions
SET balance_impact = 0.00,
    direction = COALESCE(direction, 'credit')
WHERE balance_impact IS NULL;

ALTER TABLE transactions
    ALTER COLUMN balance_impact SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_transactions_direction_values'
    ) THEN
        ALTER TABLE transactions
            ADD CONSTRAINT chk_transactions_direction_values
            CHECK (direction IS NULL OR direction IN ('debit', 'credit'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_transfer_group_id_transaction_id
    ON transactions(transfer_group_id, transaction_id);

CREATE INDEX IF NOT EXISTS idx_transactions_account_balance_impact_date
    ON transactions(account_id, balance_impact, transaction_date);
