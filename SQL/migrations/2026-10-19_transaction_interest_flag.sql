-- Marca de rendimiento en transacciones de ingreso.
--
-- Una cuenta que devenga interés acredita dinero real, así que el movimiento sigue siendo
-- `type = 'income'`: ese valor gobierna el signo del saldo y el motor de transferencias, y no se
-- toca. El rendimiento solo gana una clasificación aditiva para poder reportarlo aparte de un
-- ingreso ordinario.
--
-- Idempotente: se puede volver a aplicar sin error. El CHECK se recrea porque Postgres no tiene
-- ADD CONSTRAINT IF NOT EXISTS.

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS is_interest BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_transactions_interest_income_only;

ALTER TABLE transactions
    ADD CONSTRAINT chk_transactions_interest_income_only
    CHECK (is_interest = FALSE OR type = 'income');

COMMENT ON COLUMN transactions.is_interest IS
    'Verdadero cuando el ingreso es rendimiento de una cuenta que devenga interés. Solo clasifica: el saldo se mueve igual que cualquier otro ingreso.';
