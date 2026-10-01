-- Fase 3 — Presupuesto planificado y gastos programados (esquema).
-- DDL idempotente y re-ejecutable. Sin datos, sin secretos.
-- Orden obligatorio por FKs cruzadas:
--   recurring_items -> budget_items -> budget_item_alert_deliveries -> alert_outbox -> transactions.
-- budget_items referencia recurring_items, y transactions.origin_recurring_item_id también:
-- por eso recurring_items se crea primero y el ALTER de transactions va al final.

BEGIN;

-- Plantilla de lo que se repite cada mes (ingreso o gasto programado).
-- amount_mode='fixed' exige amount_mxn; 'average' lo deja NULL y lo deriva el servicio.
-- effective_from es la fecha de entrada en vigor decidida a mano (NULL = rige starts_period).
CREATE TABLE IF NOT EXISTS recurring_items (
    recurring_item_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('income', 'expense')),
    name VARCHAR(120) NOT NULL,
    amount_mode VARCHAR(20) NOT NULL DEFAULT 'fixed'
        CHECK (amount_mode IN ('fixed', 'average')),
    amount_mxn DECIMAL(15, 2) CHECK (amount_mxn IS NULL OR amount_mxn > 0),
    day_of_month INT NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    category_id INT,
    subcategory_id INT,
    account_id INT,
    merchant_id INT,
    starts_period CHAR(7) NOT NULL,
    ends_period CHAR(7),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    auto_execute BOOLEAN NOT NULL DEFAULT FALSE,
    effective_from DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_recurring_items_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_recurring_items_category
        FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
    CONSTRAINT fk_recurring_items_subcategory
        FOREIGN KEY (subcategory_id) REFERENCES subcategories(subcategory_id) ON DELETE RESTRICT,
    CONSTRAINT fk_recurring_items_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_recurring_items_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id) ON DELETE RESTRICT,
    CONSTRAINT ck_recurring_items_starts
        CHECK (starts_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT ck_recurring_items_ends
        CHECK (ends_period IS NULL OR ends_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT ck_recurring_items_scope
        CHECK ((category_id IS NULL) <> (subcategory_id IS NULL)),
    CONSTRAINT ck_recurring_items_income_scope
        CHECK (kind = 'expense' OR subcategory_id IS NULL),
    CONSTRAINT ck_recurring_items_fixed_amount
        CHECK (amount_mode <> 'fixed' OR amount_mxn IS NOT NULL),
    CONSTRAINT ck_recurring_items_window
        CHECK (ends_period IS NULL OR ends_period >= starts_period)
);

-- Una sola plantilla por (usuario, tipo, nombre).
CREATE UNIQUE INDEX IF NOT EXISTS uq_recurring_items_user_kind_name
    ON recurring_items(user_id, kind, name);

-- Partida planificada de un periodo (yyyy-MM). Alcance XOR: categoría o subcategoría.
-- executed y transaction_id se sostienen mutuamente (ck_budget_items_executed).
CREATE TABLE IF NOT EXISTS budget_items (
    item_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    period_key CHAR(7) NOT NULL,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('income', 'expense')),
    name VARCHAR(120) NOT NULL,
    planned_amount DECIMAL(15, 2) NOT NULL CHECK (planned_amount > 0),
    planned_date DATE NOT NULL,
    category_id INT,
    subcategory_id INT,
    account_id INT,
    merchant_id INT,
    recurring_item_id INT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'executed', 'ignored', 'cancelled')),
    is_projected BOOLEAN NOT NULL DEFAULT FALSE,
    transaction_id INT,
    source VARCHAR(20) NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'template')),
    notes VARCHAR(300),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_budget_items_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_budget_items_category
        FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
    CONSTRAINT fk_budget_items_subcategory
        FOREIGN KEY (subcategory_id) REFERENCES subcategories(subcategory_id) ON DELETE RESTRICT,
    CONSTRAINT fk_budget_items_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_budget_items_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id) ON DELETE RESTRICT,
    CONSTRAINT fk_budget_items_recurring_item
        FOREIGN KEY (recurring_item_id) REFERENCES recurring_items(recurring_item_id) ON DELETE SET NULL,
    CONSTRAINT fk_budget_items_transaction
        FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE SET NULL,
    CONSTRAINT ck_budget_items_period_key
        CHECK (period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT ck_budget_items_scope
        CHECK ((category_id IS NULL) <> (subcategory_id IS NULL)),
    -- Un gasto puede presupuestarse por subcategoría; un ingreso no (no existe subcategoría de ingreso en la práctica).
    CONSTRAINT ck_budget_items_income_scope
        CHECK (kind = 'expense' OR subcategory_id IS NULL),
    -- executed y transaction_id se sostienen mutuamente.
    CONSTRAINT ck_budget_items_executed
        CHECK ((status = 'executed' AND transaction_id IS NOT NULL)
            OR (status <> 'executed' AND transaction_id IS NULL))
);

-- Remontar un mes no puede duplicar la misma partida.
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_items_user_period_kind_name
    ON budget_items(user_id, period_key, kind, name);

-- Una transacción satisface como máximo UNA partida: mata el doble conteo y hace idempotente el enlace.
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_items_transaction
    ON budget_items(transaction_id) WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_budget_items_user_period_status
    ON budget_items(user_id, period_key, status);

CREATE INDEX IF NOT EXISTS idx_budget_items_user_status_date
    ON budget_items(user_id, status, planned_date);

-- Idempotencia de las alertas de partida: una entrega por (partida, tipo de alerta, periodo).
-- user_id se guarda como dato de la partida; no participa en resolver el destino del envío.
CREATE TABLE IF NOT EXISTS budget_item_alert_deliveries (
    delivery_id SERIAL PRIMARY KEY,
    item_id INT NOT NULL,
    user_id INT NOT NULL,
    period_key CHAR(7) NOT NULL,
    alert_kind VARCHAR(20) NOT NULL
        CHECK (alert_kind IN ('due_today', 'overdue', 'unexecuted_month_end')),
    planned_amount DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_budget_item_alert_deliveries_item
        FOREIGN KEY (item_id) REFERENCES budget_items(item_id) ON DELETE CASCADE,
    CONSTRAINT fk_budget_item_alert_deliveries_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT ck_budget_item_alert_deliveries_period_key
        CHECK (period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_item_alert_deliveries_kind_period
    ON budget_item_alert_deliveries(item_id, alert_kind, period_key);

-- Migración mínima sobre alert_outbox: la fila puede apuntar a un aviso no-presupuesto.
-- source_type: 'budget' (comportamiento de Fase 2, intacto), 'budget_item' y 'recurring_item'.
-- source_key discrimina la ocurrencia dentro de la fuente (period_key o {period_key}:{alert_kind}).
ALTER TABLE alert_outbox ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'budget';
ALTER TABLE alert_outbox ADD COLUMN IF NOT EXISTS source_id INT;
ALTER TABLE alert_outbox ADD COLUMN IF NOT EXISTS source_key VARCHAR(30);
-- El dueño de la fila. Necesario porque el outbox se lee por usuario (GET /api/alerts/outbox) y
-- las filas de partida y de ejecución automática no tienen entrega de la que derivarlo: un filtro
-- que tolerara Delivery == null devolvería el payload de todos los usuarios.
-- El orden importa: primero se puebla desde la entrega y solo después se exige NOT NULL. El backfill
-- es seguro porque hasta esta migración delivery_id era NOT NULL con FK, así que toda fila existente
-- tiene dueño derivable.
ALTER TABLE alert_outbox ADD COLUMN IF NOT EXISTS user_id INT;
UPDATE alert_outbox o SET user_id = d.user_id FROM alert_deliveries d
  WHERE o.delivery_id = d.delivery_id AND o.user_id IS NULL;
ALTER TABLE alert_outbox ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE alert_outbox DROP CONSTRAINT IF EXISTS fk_alert_outbox_user;
ALTER TABLE alert_outbox ADD CONSTRAINT fk_alert_outbox_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_alert_outbox_user_status ON alert_outbox(user_id, status);
-- Idempotente por naturaleza: no falla si delivery_id ya es nullable.
ALTER TABLE alert_outbox ALTER COLUMN delivery_id DROP NOT NULL;
ALTER TABLE alert_outbox DROP CONSTRAINT IF EXISTS fk_alert_outbox_delivery;

-- Los índices excluyen 'failed' y exigen la clave no nula: una fila expirada a failed libera
-- su clave, de modo que un aviso que sigue vigente puede volver a encolarse. Sin ese predicado,
-- la fila expirada ocuparía la clave para siempre y el aviso se perdería en silencio.
DROP INDEX IF EXISTS uq_alert_outbox_source;
DROP INDEX IF EXISTS uq_alert_outbox_delivery;
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_outbox_source
    ON alert_outbox(source_type, source_id, source_key)
    WHERE source_id IS NOT NULL AND status <> 'failed';
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_outbox_delivery
    ON alert_outbox(delivery_id)
    WHERE delivery_id IS NOT NULL AND status <> 'failed';

-- Origen de la transacción: distingue la capturada a mano de la creada por el motor de programados.
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS origin VARCHAR(20) NOT NULL DEFAULT 'manual'
        CHECK (origin IN ('manual', 'auto_recurring')),
    ADD COLUMN IF NOT EXISTS origin_recurring_item_id INT;

-- Re-ejecutable: la FK se recrea (no hay ADD CONSTRAINT IF NOT EXISTS en Postgres).
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_origin_recurring_item;
ALTER TABLE transactions
    ADD CONSTRAINT fk_transactions_origin_recurring_item
        FOREIGN KEY (origin_recurring_item_id) REFERENCES recurring_items(recurring_item_id)
        ON DELETE SET NULL;

-- Libera la partida cuando desaparece la transacción que la cumplía.
-- Por qué en la base y no en el servicio: transactions.account_id referencia a accounts con
-- ON DELETE CASCADE, así que borrar una cuenta borra sus transacciones sin pasar por ningún
-- servicio; un reset en TransactionCommandService no cubriría esa cascada y el FK
-- ON DELETE SET NULL de budget_items.transaction_id dejaría la fila en 'executed' con
-- transaction_id NULL, violando ck_budget_items_executed (CheckViolation 23514).
-- BEFORE DELETE corre antes de la acción referencial de la FK, por eso el CHECK nunca ve una
-- fila incoherente. Idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS + CREATE TRIGGER.
-- El UPDATE usa el índice único parcial uq_budget_items_transaction (transaction_id no nulo).
CREATE OR REPLACE FUNCTION fn_budget_items_release_on_transaction_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE budget_items
       SET status = 'pending',
           transaction_id = NULL,
           updated_at = CURRENT_TIMESTAMP
     WHERE transaction_id = OLD.transaction_id
       AND status = 'executed';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_budget_items_release_on_transaction_delete ON transactions;

CREATE TRIGGER trg_budget_items_release_on_transaction_delete
    BEFORE DELETE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION fn_budget_items_release_on_transaction_delete();

COMMIT;

ANALYZE recurring_items;
ANALYZE budget_items;
ANALYZE budget_item_alert_deliveries;
ANALYZE alert_outbox;
ANALYZE transactions;
