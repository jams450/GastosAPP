-- Enable synthetic opening credit transactions used for inherited debt setup.
-- Keeps existing flow and allows opening charges to persist without DB constraint failures.

DO $$
DECLARE
    check_name text;
BEGIN
    SELECT c.conname
    INTO check_name
    FROM pg_constraint c
    INNER JOIN pg_class t ON t.oid = c.conrelid
    INNER JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'transactions'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%type%'
    LIMIT 1;

    IF check_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.transactions DROP CONSTRAINT %I;', check_name);
    END IF;
END $$;

ALTER TABLE public.transactions
ADD CONSTRAINT transactions_type_check
CHECK (type IN ('income', 'expense', 'transfer', 'opening_credit', 'transfer_in', 'transfer_out'));

ANALYZE public.transactions;
