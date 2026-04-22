DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transactions'
          AND column_name = 'transaction_date'
          AND data_type = 'date'
    ) THEN
        ALTER TABLE transactions
            ALTER COLUMN transaction_date TYPE TIMESTAMP WITH TIME ZONE
            USING (transaction_date::timestamp AT TIME ZONE 'UTC');
    END IF;
END $$;

ANALYZE transactions;
