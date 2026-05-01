-- Seed template: opening credit charges without affecting account balance.
--
-- Usage:
-- 1) Replace rows in input_rows CTE with your real data.
-- 2) Run inside transaction.
-- 3) Verify output counts and sampled rows.

BEGIN;

WITH input_rows AS (
    -- account_id, amount, months, occurred_at_utc, description
    SELECT * FROM (
        VALUES
            -- (10, 1200.00::numeric(15,2), 12, '2026-01-15T12:00:00Z'::timestamptz, 'MSI heredado laptop'),
            -- (10, 550.00::numeric(15,2), 1,  '2026-01-15T12:00:00Z'::timestamptz, 'Cargo heredado revolvente')
            (NULL::int, NULL::numeric(15,2), NULL::int, NULL::timestamptz, NULL::text)
    ) AS t(account_id, amount, months, occurred_at, description)
    WHERE account_id IS NOT NULL
),
validated_rows AS (
    SELECT
        row_number() OVER (ORDER BY i.account_id, i.occurred_at, i.amount, i.description) AS row_id,
        i.account_id,
        i.amount,
        GREATEST(1, LEAST(COALESCE(i.months, 1), 60)) AS months,
        COALESCE(i.occurred_at, now()) AS occurred_at,
        COALESCE(NULLIF(trim(i.description), ''), 'Saldo inicial heredado') AS description
    FROM input_rows i
    JOIN accounts a ON a.account_id = i.account_id
    WHERE a.is_credit = true
      AND i.amount > 0
),
inserted_tx AS (
    INSERT INTO transactions (
        account_id,
        type,
        amount,
        balance_impact,
        direction,
        description,
        transaction_date,
        created,
        updated,
        is_active
    )
    SELECT
        v.account_id,
        'opening_credit',
        v.amount,
        0,
        'credit',
        v.description,
        v.occurred_at,
        now(),
        NULL,
        true
    FROM validated_rows v
    RETURNING transaction_id, account_id, amount, transaction_date, description
),
tx_with_row AS (
    SELECT
        tx.transaction_id,
        tx.account_id,
        tx.amount,
        tx.transaction_date,
        v.row_id,
        v.months
    FROM inserted_tx tx
    JOIN validated_rows v
      ON v.account_id = tx.account_id
     AND v.amount = tx.amount
     AND v.description = tx.description
),
inserted_charge AS (
    INSERT INTO credit_charges (
        account_id,
        source_transaction_id,
        cycle_id,
        occurred_at,
        principal_amount,
        status,
        created,
        updated,
        is_active
    )
    SELECT
        txr.account_id,
        txr.transaction_id,
        NULL,
        txr.transaction_date,
        txr.amount,
        'Open',
        now(),
        NULL,
        true
    FROM tx_with_row txr
    RETURNING charge_id, account_id, source_transaction_id, principal_amount, occurred_at
),
charge_with_months AS (
    SELECT
        c.charge_id,
        c.account_id,
        c.source_transaction_id,
        c.principal_amount,
        c.occurred_at,
        v.months,
        ROUND(c.principal_amount / v.months, 2) AS monthly_amount_base
    FROM inserted_charge c
    JOIN tx_with_row tx
      ON tx.transaction_id = c.source_transaction_id
),
inserted_plan AS (
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
        created,
        updated,
        is_active
    )
    SELECT
        cwm.account_id,
        cwm.charge_id,
        CASE WHEN cwm.months > 1 THEN 'MSI' ELSE 'Revolving' END,
        cwm.months,
        cwm.principal_amount,
        cwm.monthly_amount_base,
        cwm.principal_amount - (cwm.monthly_amount_base * cwm.months),
        NULL,
        'Active',
        now(),
        NULL,
        true
    FROM charge_with_months cwm
    RETURNING plan_id, source_charge_id, months, monthly_amount_base, rounding_residual
)
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
    created,
    updated,
    is_active
)
SELECT
    p.plan_id,
    gs.installment_number,
    NULL,
    (c.occurred_at::date + make_interval(months => gs.installment_number))::timestamptz,
    CASE WHEN gs.installment_number = p.months
         THEN p.monthly_amount_base + p.rounding_residual
         ELSE p.monthly_amount_base
    END,
    0,
    0,
    CASE WHEN gs.installment_number = p.months
         THEN p.monthly_amount_base + p.rounding_residual
         ELSE p.monthly_amount_base
    END,
    'Open',
    now(),
    NULL,
    true
FROM inserted_plan p
JOIN credit_charges c ON c.charge_id = p.source_charge_id
JOIN LATERAL generate_series(1, p.months) AS gs(installment_number) ON true;

COMMIT;

-- Diagnostic check:
-- SELECT t.transaction_id, t.account_id, t.type, t.amount, t.balance_impact,
--        cc.charge_id, cip.plan_id, cip.plan_type, cip.months
-- FROM transactions t
-- JOIN credit_charges cc ON cc.source_transaction_id = t.transaction_id
-- JOIN credit_installment_plans cip ON cip.source_charge_id = cc.charge_id
-- WHERE t.type = 'opening_credit'
-- ORDER BY t.transaction_id DESC
-- LIMIT 50;
