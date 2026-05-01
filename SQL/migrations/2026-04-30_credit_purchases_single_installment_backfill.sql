BEGIN;

-- Objetivo:
-- 1) Garantizar que cada compra en cuenta de crédito (expense) tenga credit_charge.
-- 2) Garantizar plan + mensualidad para cada charge.
-- 3) Normalizar a 1 mensualidad (Revolving) cuando sea seguro.
--
-- Seguridad:
-- - No toca planes que ya tienen asignaciones en installment_allocations.
-- - Esos casos quedan para migración manual controlada.

-- 1) Crear credit_charges faltantes desde transacciones expense en cuentas crédito
INSERT INTO credit_charges (
    account_id,
    source_transaction_id,
    cycle_id,
    occurred_at,
    principal_amount,
    status,
    created_at,
    updated_at
)
SELECT
    t.account_id,
    t.transaction_id,
    NULL,
    t.transaction_date,
    t.amount,
    'Open',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM transactions t
INNER JOIN accounts a ON a.account_id = t.account_id
LEFT JOIN credit_charges cc ON cc.source_transaction_id = t.transaction_id
WHERE a.is_credit = TRUE
  AND t.type = 'expense'
  AND t.amount > 0
  AND cc.charge_id IS NULL;

-- 2) Crear plan faltante (default 1 mensualidad Revolving)
INSERT INTO credit_installment_plans (
    account_id,
    source_charge_id,
    plan_type,
    months,
    principal_amount,
    monthly_amount_base,
    rounding_residual,
    start_cycle_id,
    status,
    created_at,
    updated_at
)
SELECT
    cc.account_id,
    cc.charge_id,
    'Revolving',
    1,
    cc.principal_amount,
    cc.principal_amount,
    0,
    cc.cycle_id,
    CASE WHEN cc.status = 'Paid' THEN 'Completed' ELSE 'Active' END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM credit_charges cc
LEFT JOIN credit_installment_plans cip ON cip.source_charge_id = cc.charge_id
WHERE cip.plan_id IS NULL;

-- 3) Crear mensualidad faltante para planes sin installments
INSERT INTO credit_installments (
    plan_id,
    installment_number,
    due_cycle_id,
    due_date,
    principal_due,
    interest_due,
    fee_due,
    total_due,
    status,
    created_at,
    updated_at
)
SELECT
    p.plan_id,
    1,
    p.start_cycle_id,
    cc.occurred_at,
    p.principal_amount,
    0,
    0,
    p.principal_amount,
    CASE WHEN p.status = 'Completed' THEN 'Paid' ELSE 'Open' END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM credit_installment_plans p
INNER JOIN credit_charges cc ON cc.charge_id = p.source_charge_id
LEFT JOIN credit_installments ci ON ci.plan_id = p.plan_id
WHERE ci.installment_id IS NULL;

-- 4) Normalizar planes a 1 mensualidad SOLO si no hay asignaciones
WITH plans_without_allocations AS (
    SELECT p.plan_id
    FROM credit_installment_plans p
    LEFT JOIN credit_installments ci ON ci.plan_id = p.plan_id
    LEFT JOIN installment_allocations ia ON ia.installment_id = ci.installment_id
    GROUP BY p.plan_id
    HAVING COALESCE(SUM(CASE WHEN ia.allocation_id IS NULL THEN 0 ELSE 1 END), 0) = 0
),
primary_installment AS (
    SELECT
        ci.plan_id,
        MIN(ci.installment_id) AS keep_installment_id,
        MIN(ci.due_date) AS keep_due_date,
        MIN(ci.due_cycle_id) AS keep_due_cycle_id
    FROM credit_installments ci
    INNER JOIN plans_without_allocations pwa ON pwa.plan_id = ci.plan_id
    GROUP BY ci.plan_id
)
UPDATE credit_installment_plans p
SET
    plan_type = 'Revolving',
    months = 1,
    monthly_amount_base = p.principal_amount,
    rounding_residual = 0,
    updated_at = CURRENT_TIMESTAMP
FROM plans_without_allocations pwa
WHERE p.plan_id = pwa.plan_id;

-- 5) Borrar installments extra de planes normalizados (sin allocations)
WITH plans_without_allocations AS (
    SELECT p.plan_id
    FROM credit_installment_plans p
    LEFT JOIN credit_installments ci ON ci.plan_id = p.plan_id
    LEFT JOIN installment_allocations ia ON ia.installment_id = ci.installment_id
    GROUP BY p.plan_id
    HAVING COALESCE(SUM(CASE WHEN ia.allocation_id IS NULL THEN 0 ELSE 1 END), 0) = 0
),
primary_installment AS (
    SELECT
        ci.plan_id,
        MIN(ci.installment_id) AS keep_installment_id
    FROM credit_installments ci
    INNER JOIN plans_without_allocations pwa ON pwa.plan_id = ci.plan_id
    GROUP BY ci.plan_id
)
DELETE FROM credit_installments ci
USING primary_installment pi
WHERE ci.plan_id = pi.plan_id
  AND ci.installment_id <> pi.keep_installment_id;

-- 6) Forzar contenido de la única mensualidad al principal del plan
UPDATE credit_installments ci
SET
    installment_number = 1,
    principal_due = p.principal_amount,
    interest_due = 0,
    fee_due = 0,
    total_due = p.principal_amount,
    status = CASE WHEN p.status = 'Completed' THEN 'Paid' ELSE 'Open' END,
    updated_at = CURRENT_TIMESTAMP
FROM credit_installment_plans p
WHERE ci.plan_id = p.plan_id;

COMMIT;

-- Diagnóstico post-migración
-- Planes aún no normalizados porque tienen allocations históricas.
SELECT
    p.plan_id,
    p.source_charge_id,
    p.plan_type,
    p.months,
    COUNT(ia.allocation_id) AS allocations_count
FROM credit_installment_plans p
INNER JOIN credit_installments ci ON ci.plan_id = p.plan_id
LEFT JOIN installment_allocations ia ON ia.installment_id = ci.installment_id
GROUP BY p.plan_id, p.source_charge_id, p.plan_type, p.months
HAVING p.months <> 1 OR p.plan_type <> 'Revolving'
ORDER BY p.plan_id;

ANALYZE credit_charges;
ANALYZE credit_installment_plans;
ANALYZE credit_installments;
