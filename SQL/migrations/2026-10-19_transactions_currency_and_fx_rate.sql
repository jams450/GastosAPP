-- Divisa y tipo de cambio congelado en cada transacción.
--
-- Cuatro columnas aditivas más un backfill que declara la verdad actual: toda fila existente está en
-- pesos y su importe en pesos es su importe. Ese backfill es lo que hace seguros los dos NOT NULL
-- posteriores; sin él, la migración fallaría en cualquier base que ya tenga movimientos.
--
-- `fx_rate` son pesos por UNA unidad de `currency_code`, igual que `fx_rates.rate_mxn`: convertir es
-- multiplicar y no existe la ambigüedad de la tasa invertida.
--
-- Que la divisa base no lleve tasa no se puede expresar con un CHECK, porque `is_base` vive en
-- `currencies` y un CHECK no consulta otra tabla. Lo garantiza la capa de aplicación.
--
-- Idempotente: se puede volver a aplicar sin error.

BEGIN;

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3),
    ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(18, 8),
    ADD COLUMN IF NOT EXISTS fx_rate_date DATE,
    ADD COLUMN IF NOT EXISTS amount_mxn NUMERIC(15, 2);

-- Backfill. No es una aproximación: ninguna fila pudo capturarse en otra divisa antes de que la
-- columna existiera, así que SUM(amount) y SUM(amount_mxn) deben coincidir exactamente.
UPDATE transactions SET currency_code = 'MXN' WHERE currency_code IS NULL;
UPDATE transactions SET amount_mxn = amount WHERE amount_mxn IS NULL;

ALTER TABLE transactions ALTER COLUMN currency_code SET NOT NULL;
ALTER TABLE transactions ALTER COLUMN amount_mxn SET NOT NULL;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_currency_code;
ALTER TABLE transactions
    ADD CONSTRAINT fk_transactions_currency_code
    FOREIGN KEY (currency_code) REFERENCES currencies(code) ON DELETE RESTRICT;

-- La tasa y su fecha van juntas o no van: una tasa sin fecha no permite mostrar de qué día salió, y
-- una fecha sin tasa no convierte nada. fx_rate > 0 porque una tasa en cero produciría un importe en
-- pesos de cero sin que nadie lo note.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_transactions_fx_rate_pair;
ALTER TABLE transactions
    ADD CONSTRAINT chk_transactions_fx_rate_pair
    CHECK (
        (fx_rate IS NULL AND fx_rate_date IS NULL)
        OR (fx_rate > 0 AND fx_rate_date IS NOT NULL)
    );

COMMENT ON COLUMN transactions.currency_code IS
    'Divisa en que se capturó el movimiento. La consolidación usa amount_mxn.';
COMMENT ON COLUMN transactions.fx_rate IS
    'Pesos por una unidad de currency_code, congelados al capturar. Nulo en la divisa base.';
COMMENT ON COLUMN transactions.fx_rate_date IS
    'Fecha de publicación de la tasa usada, no la fecha de captura: deja ver cuándo hubo carry-forward.';
COMMENT ON COLUMN transactions.amount_mxn IS
    'Importe consolidado en la divisa base. amount * fx_rate al capturar; no se recalcula al editar.';

COMMIT;
