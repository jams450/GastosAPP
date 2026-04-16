ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS payment_due_day INT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_accounts_payment_due_day_range'
    ) THEN
        ALTER TABLE accounts
            ADD CONSTRAINT chk_accounts_payment_due_day_range
            CHECK (payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 31);
    END IF;
END $$;
