-- Recalcula accounts.initial_balance usando reglas históricas:
-- - income  => +amount
-- - expense => -amount
-- - transfer (por transfer_group_id ordenado por transaction_id):
--     1er registro => -amount
--     2do registro => +amount
-- Fórmula final por cuenta:
--   initial_balance = current_balance - SUM(impacto_historico)

BEGIN;

WITH transfer_ranked AS (
    SELECT
        t.transaction_id,
        t.transfer_group_id,
        ROW_NUMBER() OVER (PARTITION BY t.transfer_group_id ORDER BY t.transaction_id) AS rn,
        COUNT(*) OVER (PARTITION BY t.transfer_group_id) AS cnt
    FROM transactions t
    WHERE t.type = 'transfer'
      AND t.transfer_group_id IS NOT NULL
),
transaction_impacts AS (
    SELECT
        t.account_id,
        CASE
            WHEN t.type = 'income' THEN t.amount
            WHEN t.type = 'expense' THEN t.amount * -1
            WHEN t.type = 'transfer' THEN
                CASE
                    WHEN tr.cnt >= 2 AND tr.rn = 1 THEN t.amount * -1
                    WHEN tr.cnt >= 2 AND tr.rn = 2 THEN t.amount
                    -- Fallback para grupos anómalos (por si hubiera más/menos de 2)
                    ELSE t.amount
                END
            ELSE 0
        END AS impact
    FROM transactions t
    LEFT JOIN transfer_ranked tr ON tr.transaction_id = t.transaction_id
),
net_by_account AS (
    SELECT
        account_id,
        COALESCE(SUM(impact), 0) AS net_impact
    FROM transaction_impacts
    GROUP BY account_id
)
UPDATE accounts a
SET initial_balance = ROUND(a.current_balance - COALESCE(n.net_impact, 0), 2)
FROM net_by_account n
WHERE a.account_id = n.account_id;

-- Cuentas sin transacciones: initial = current
UPDATE accounts a
SET initial_balance = a.current_balance
WHERE NOT EXISTS (
    SELECT 1
    FROM transactions t
    WHERE t.account_id = a.account_id
);

COMMIT;
