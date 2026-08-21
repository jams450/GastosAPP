BEGIN;

WITH plan_ranges AS (
    SELECT
        a.account_id,
        a.due_day,
        a.payment_due_day,
        CASE
            WHEN EXTRACT(DAY FROM (cc.occurred_at AT TIME ZONE 'UTC')) <= a.due_day THEN date_trunc('month', cc.occurred_at AT TIME ZONE 'UTC')::date
            ELSE date_trunc('month', (cc.occurred_at AT TIME ZONE 'UTC') + INTERVAL '1 month')::date
        END AS first_cycle_month,
        (
            CASE
                WHEN EXTRACT(DAY FROM (cc.occurred_at AT TIME ZONE 'UTC')) <= a.due_day THEN date_trunc('month', cc.occurred_at AT TIME ZONE 'UTC')::date
                ELSE date_trunc('month', (cc.occurred_at AT TIME ZONE 'UTC') + INTERVAL '1 month')::date
            END + make_interval(months => GREATEST(cip.months, 1) - 1)
        )::date AS last_cycle_month
    FROM credit_installment_plans cip
    INNER JOIN credit_charges cc ON cc.charge_id = cip.source_charge_id
    INNER JOIN accounts a ON a.account_id = cip.account_id
    WHERE a.is_credit = TRUE
      AND a.due_day IS NOT NULL
),
account_ranges AS (
    SELECT
        pr.account_id,
        pr.due_day,
        pr.payment_due_day,
        MIN(pr.first_cycle_month) AS min_cycle_month,
        MAX(pr.last_cycle_month) AS max_cycle_month
    FROM plan_ranges pr
    GROUP BY pr.account_id, pr.due_day, pr.payment_due_day
),
generated_months AS (
    SELECT
        ar.account_id,
        ar.due_day,
        ar.payment_due_day,
        gs::date AS cycle_month
    FROM account_ranges ar
    CROSS JOIN LATERAL generate_series(ar.min_cycle_month, ar.max_cycle_month, INTERVAL '1 month') gs
)
INSERT INTO credit_cycles (
    account_id,
    start_at,
    cutoff_at,
    due_at,
    opening_balance,
    new_charges,
    interests_fees,
    payments_until_cutoff,
    statement_balance,
    minimum_due,
    paid_by_due_date,
    remaining_by_due_date,
    state,
    created_at,
    updated_at
)
SELECT
    gm.account_id,
    (((make_date(
        EXTRACT(YEAR FROM (gm.cycle_month - INTERVAL '1 month'))::int,
        EXTRACT(MONTH FROM (gm.cycle_month - INTERVAL '1 month'))::int,
        LEAST(
            gm.due_day,
            EXTRACT(DAY FROM ((date_trunc('month', gm.cycle_month - INTERVAL '1 month') + INTERVAL '1 month') - INTERVAL '1 day'))::int
        )
    ) + INTERVAL '1 day')::date)::timestamp AT TIME ZONE 'UTC') AS start_at,
    (make_date(
        EXTRACT(YEAR FROM gm.cycle_month)::int,
        EXTRACT(MONTH FROM gm.cycle_month)::int,
        LEAST(
            gm.due_day,
            EXTRACT(DAY FROM ((date_trunc('month', gm.cycle_month) + INTERVAL '1 month') - INTERVAL '1 day'))::int
        )
    )::timestamp AT TIME ZONE 'UTC') AS cutoff_at,
    (make_date(
        EXTRACT(YEAR FROM gm.cycle_month)::int,
        EXTRACT(MONTH FROM gm.cycle_month)::int,
        LEAST(
            COALESCE(gm.payment_due_day, 31),
            EXTRACT(DAY FROM ((date_trunc('month', gm.cycle_month) + INTERVAL '1 month') - INTERVAL '1 day'))::int
        )
    )::timestamp AT TIME ZONE 'UTC') AS due_at,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    'Open',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM generated_months gm
LEFT JOIN credit_cycles existing
    ON existing.account_id = gm.account_id
   AND existing.cutoff_at = (make_date(
        EXTRACT(YEAR FROM gm.cycle_month)::int,
        EXTRACT(MONTH FROM gm.cycle_month)::int,
        LEAST(
            gm.due_day,
            EXTRACT(DAY FROM ((date_trunc('month', gm.cycle_month) + INTERVAL '1 month') - INTERVAL '1 day'))::int
        )
    )::timestamp AT TIME ZONE 'UTC')
WHERE existing.cycle_id IS NULL;

UPDATE credit_charges cc
SET cycle_id = cy.cycle_id,
    updated_at = CURRENT_TIMESTAMP
FROM credit_cycles cy
WHERE cc.account_id = cy.account_id
  AND (cc.occurred_at AT TIME ZONE 'UTC')::date >= (cy.start_at AT TIME ZONE 'UTC')::date
  AND (cc.occurred_at AT TIME ZONE 'UTC')::date <= (cy.cutoff_at AT TIME ZONE 'UTC')::date
  AND (cc.cycle_id IS DISTINCT FROM cy.cycle_id);

UPDATE credit_installment_plans cip
SET start_cycle_id = cc.cycle_id,
    updated_at = CURRENT_TIMESTAMP
FROM credit_charges cc
WHERE cc.charge_id = cip.source_charge_id
  AND cc.cycle_id IS NOT NULL
  AND (cip.start_cycle_id IS DISTINCT FROM cc.cycle_id);

WITH ranked_cycles AS (
    SELECT
        cy.cycle_id,
        cy.account_id,
        ROW_NUMBER() OVER (PARTITION BY cy.account_id ORDER BY cy.cutoff_at) AS cycle_rank
    FROM credit_cycles cy
),
installment_targets AS (
    SELECT
        ci.installment_id,
        rc_target.cycle_id AS due_cycle_id
    FROM credit_installments ci
    INNER JOIN credit_installment_plans cip ON cip.plan_id = ci.plan_id
    INNER JOIN ranked_cycles rc_start
        ON rc_start.account_id = cip.account_id
       AND rc_start.cycle_id = cip.start_cycle_id
    INNER JOIN ranked_cycles rc_target
        ON rc_target.account_id = cip.account_id
       AND rc_target.cycle_rank = rc_start.cycle_rank + ci.installment_number - 1
)
UPDATE credit_installments ci
SET due_cycle_id = it.due_cycle_id,
    updated_at = CURRENT_TIMESTAMP
FROM installment_targets it
WHERE ci.installment_id = it.installment_id
  AND (ci.due_cycle_id IS DISTINCT FROM it.due_cycle_id);

UPDATE credit_installments ci
SET due_date = cy.due_at,
    updated_at = CURRENT_TIMESTAMP
FROM credit_cycles cy
WHERE cy.cycle_id = ci.due_cycle_id
  AND (ci.due_date IS DISTINCT FROM cy.due_at);

CREATE OR REPLACE FUNCTION fn_dashboard_credit_overview(
    p_user_id INT,
    p_month_start TIMESTAMPTZ,
    p_next_month_start TIMESTAMPTZ,
    p_year_value INT,
    p_month_value INT,
    p_days_in_month INT,
    p_previous_year INT,
    p_previous_month INT,
    p_previous_days_in_month INT
)
RETURNS TABLE (
    "AccountId" INT,
    "Name" VARCHAR,
    "Active" BOOLEAN,
    "IsCredit" BOOLEAN,
    "CutoffDay" INT,
    "PaymentDueDay" INT,
    "InitialBalance" NUMERIC,
    "CurrentBalance" NUMERIC,
    "OpeningBalance" NUMERIC,
    "MonthIncome" NUMERIC,
    "MonthExpense" NUMERIC,
    "MonthTransferIn" NUMERIC,
    "MonthTransferOut" NUMERIC,
    "MonthNet" NUMERIC,
    "ClosingBalance" NUMERIC,
    "CreditLimit" NUMERIC,
    "PeriodStart" DATE,
    "PeriodEnd" DATE,
    "PeriodSpent" NUMERIC,
    "EstimatedCutoffCharges" NUMERIC,
    "CutoffPayments" NUMERIC,
    "CutoffPending" NUMERIC,
    "MsiOutstanding" NUMERIC,
    "NormalOutstanding" NUMERIC
)
LANGUAGE sql
AS $$
WITH accounts_scope AS (
    SELECT
        a.account_id,
        a.name,
        a.active,
        a.is_credit,
        a.due_day,
        a.payment_due_day,
        a.initial_balance,
        a.current_balance,
        a.credit_limit
    FROM accounts a
    WHERE a.user_id = p_user_id
),
tx_scope AS (
    SELECT
        t.transaction_id,
        t.account_id,
        t.type,
        t.transfer_group_id,
        t.amount,
        t.balance_impact,
        t.transaction_date
    FROM transactions t
    INNER JOIN accounts_scope a ON a.account_id = t.account_id
    WHERE t.transaction_date < p_next_month_start
),
transfer_rank AS (
    SELECT
        t.transaction_id,
        row_number() OVER (PARTITION BY t.transfer_group_id ORDER BY t.transaction_id) AS row_num,
        count(*) OVER (PARTITION BY t.transfer_group_id) AS group_size
    FROM tx_scope t
    WHERE lower(t.type) = 'transfer' AND t.transfer_group_id IS NOT NULL
),
tx_with_impact AS (
    SELECT
        t.account_id,
        t.type,
        t.amount,
        t.transaction_date,
        CASE
            WHEN t.balance_impact <> 0 THEN t.balance_impact
            WHEN lower(t.type) = 'income' THEN t.amount
            WHEN lower(t.type) = 'expense' THEN t.amount * -1
            WHEN lower(t.type) = 'transfer' AND t.transfer_group_id IS NULL THEN t.amount
            WHEN lower(t.type) = 'transfer' THEN
                CASE
                    WHEN coalesce(r.group_size, 0) < 2 THEN t.amount
                    WHEN r.row_num = 1 THEN t.amount * -1
                    ELSE t.amount
                END
            ELSE 0
        END AS impact
    FROM tx_scope t
    LEFT JOIN transfer_rank r ON r.transaction_id = t.transaction_id
),
month_agg AS (
    SELECT
        a.account_id,
        coalesce(sum(CASE WHEN t.transaction_date < p_month_start THEN t.impact ELSE 0 END), 0) AS prior_impact,
        coalesce(sum(CASE
            WHEN t.transaction_date >= p_month_start
             AND t.transaction_date < p_next_month_start
             AND lower(t.type) = 'income'
             AND a.is_credit = FALSE
            THEN t.amount
            ELSE 0
        END), 0) AS month_income,
        coalesce(sum(CASE
            WHEN t.transaction_date >= p_month_start
             AND t.transaction_date < p_next_month_start
             AND lower(t.type) = 'expense'
            THEN t.amount
            ELSE 0
        END), 0) AS month_expense,
        coalesce(sum(CASE
            WHEN t.transaction_date >= p_month_start
             AND t.transaction_date < p_next_month_start
             AND lower(t.type) = 'transfer'
             AND t.impact > 0
            THEN t.impact
            ELSE 0
        END), 0) AS month_transfer_in,
        coalesce(sum(CASE
            WHEN t.transaction_date >= p_month_start
             AND t.transaction_date < p_next_month_start
             AND lower(t.type) = 'transfer'
             AND t.impact < 0
            THEN abs(t.impact)
            ELSE 0
        END), 0) AS month_transfer_out,
        coalesce(sum(CASE WHEN t.transaction_date >= p_month_start AND t.transaction_date < p_next_month_start THEN t.impact ELSE 0 END), 0) AS month_net
    FROM accounts_scope a
    LEFT JOIN tx_with_impact t ON t.account_id = a.account_id
    GROUP BY a.account_id
),
credit_bounds AS (
    SELECT
        a.account_id,
        CASE WHEN a.is_credit THEN make_date(p_year_value, p_month_value, LEAST(GREATEST(coalesce(a.due_day, p_days_in_month), 1), p_days_in_month)) END AS period_end,
        CASE WHEN a.is_credit THEN (make_date(p_previous_year, p_previous_month, LEAST(GREATEST(coalesce(a.due_day, p_previous_days_in_month), 1), p_previous_days_in_month)) + INTERVAL '1 day')::date END AS period_start,
        CASE WHEN a.is_credit THEN make_date(p_year_value, p_month_value, 1) END AS payment_start,
        CASE WHEN a.is_credit THEN make_date(
            p_year_value,
            p_month_value,
            LEAST(
                GREATEST(coalesce(a.payment_due_day, p_days_in_month), 1),
                p_days_in_month
            )
        ) END AS payment_end
    FROM accounts_scope a
),
msi_source_transactions AS (
    SELECT DISTINCT
        cc.source_transaction_id AS transaction_id
    FROM credit_charges cc
    INNER JOIN credit_installment_plans cip ON cip.source_charge_id = cc.charge_id
    WHERE cip.plan_type = 'MSI'
),
credit_spent AS (
    SELECT
        cb.account_id,
        coalesce(chg.regular_cutoff_charges, 0) + coalesce(msi.msi_cutoff_charges, 0) AS period_spent,
        coalesce(chg.regular_cutoff_charges, 0) + coalesce(msi.msi_cutoff_charges, 0) AS estimated_cutoff_charges,
        coalesce(pay.cutoff_payments, 0) AS cutoff_payments,
        GREATEST((coalesce(chg.regular_cutoff_charges, 0) + coalesce(msi.msi_cutoff_charges, 0)) - coalesce(pay.cutoff_payments, 0), 0) AS cutoff_pending
    FROM credit_bounds cb
    LEFT JOIN (
        SELECT
            cb2.account_id,
            coalesce(sum(CASE
                WHEN lower(t.type) = 'expense' AND mst.transaction_id IS NULL THEN t.amount
                WHEN lower(t.type) = 'transfer' AND t.balance_impact < 0 THEN abs(t.balance_impact)
                ELSE 0
            END), 0) AS regular_cutoff_charges
        FROM credit_bounds cb2
        LEFT JOIN transactions t
            ON t.account_id = cb2.account_id
           AND cb2.period_start IS NOT NULL
           AND cb2.period_end IS NOT NULL
           AND t.transaction_date >= cb2.period_start
           AND t.transaction_date < (cb2.period_end + INTERVAL '1 day')
        LEFT JOIN msi_source_transactions mst ON mst.transaction_id = t.transaction_id
        GROUP BY cb2.account_id
    ) chg ON chg.account_id = cb.account_id
    LEFT JOIN (
        SELECT
            cbm.account_id,
            coalesce(sum(GREATEST(ci.total_due - coalesce(ip.allocated_total, 0), 0)), 0) AS msi_cutoff_charges
        FROM credit_bounds cbm
        INNER JOIN credit_installment_plans cip
            ON cip.account_id = cbm.account_id
           AND cip.plan_type = 'MSI'
        INNER JOIN credit_installments ci
            ON ci.plan_id = cip.plan_id
           AND ci.status IN ('Open', 'PartiallyPaid', 'Overdue')
        LEFT JOIN credit_cycles dc ON dc.cycle_id = ci.due_cycle_id
        LEFT JOIN (
            SELECT
                ia.installment_id,
                coalesce(sum(ia.allocated_amount), 0) AS allocated_total
            FROM installment_allocations ia
            INNER JOIN credit_payments cp ON cp.payment_id = ia.payment_id AND cp.status = 'Posted'
            GROUP BY ia.installment_id
        ) ip ON ip.installment_id = ci.installment_id
        WHERE cbm.payment_start IS NOT NULL
          AND cbm.payment_end IS NOT NULL
          AND (coalesce(dc.due_at, ci.due_date) AT TIME ZONE 'UTC')::date >= cbm.payment_start
          AND (coalesce(dc.due_at, ci.due_date) AT TIME ZONE 'UTC')::date < (cbm.payment_end + INTERVAL '1 day')
        GROUP BY cbm.account_id
    ) msi ON msi.account_id = cb.account_id
    LEFT JOIN (
        SELECT
            cb3.account_id,
            coalesce(sum(CASE
                WHEN lower(t.type) = 'income' THEN t.amount
                WHEN lower(t.type) = 'transfer' AND t.balance_impact > 0 THEN t.balance_impact
                ELSE 0
            END), 0) AS cutoff_payments
        FROM credit_bounds cb3
        LEFT JOIN transactions t
            ON t.account_id = cb3.account_id
           AND cb3.payment_start IS NOT NULL
           AND cb3.payment_end IS NOT NULL
           AND t.transaction_date >= cb3.payment_start
           AND t.transaction_date < (cb3.payment_end + INTERVAL '1 day')
        GROUP BY cb3.account_id
    ) pay ON pay.account_id = cb.account_id
),
installment_paid AS (
    SELECT
        ia.installment_id,
        coalesce(sum(ia.allocated_amount), 0) AS allocated_total
    FROM installment_allocations ia
    INNER JOIN credit_payments cp ON cp.payment_id = ia.payment_id AND cp.status = 'Posted'
    GROUP BY ia.installment_id
),
credit_installment_breakdown AS (
    SELECT
        cip.account_id,
        coalesce(sum(CASE
            WHEN cip.plan_type = 'MSI' THEN GREATEST(ci.total_due - coalesce(ip.allocated_total, 0), 0)
            ELSE 0
        END), 0) AS msi_outstanding,
        coalesce(sum(CASE
            WHEN cip.plan_type = 'Revolving' THEN GREATEST(ci.total_due - coalesce(ip.allocated_total, 0), 0)
            ELSE 0
        END), 0) AS normal_outstanding
    FROM credit_installments ci
    INNER JOIN credit_installment_plans cip ON cip.plan_id = ci.plan_id
    INNER JOIN accounts_scope a ON a.account_id = cip.account_id AND a.is_credit = TRUE
    LEFT JOIN installment_paid ip ON ip.installment_id = ci.installment_id
    WHERE ci.status IN ('Open', 'PartiallyPaid', 'Overdue')
    GROUP BY cip.account_id
)
SELECT
    a.account_id AS "AccountId",
    a.name AS "Name",
    a.active AS "Active",
    a.is_credit AS "IsCredit",
    a.due_day AS "CutoffDay",
    a.payment_due_day AS "PaymentDueDay",
    a.initial_balance AS "InitialBalance",
    a.current_balance AS "CurrentBalance",
    (a.initial_balance + coalesce(m.prior_impact, 0)) AS "OpeningBalance",
    coalesce(m.month_income, 0) AS "MonthIncome",
    coalesce(m.month_expense, 0) AS "MonthExpense",
    coalesce(m.month_transfer_in, 0) AS "MonthTransferIn",
    coalesce(m.month_transfer_out, 0) AS "MonthTransferOut",
    coalesce(m.month_net, 0) AS "MonthNet",
    (a.initial_balance + coalesce(m.prior_impact, 0) + coalesce(m.month_net, 0)) AS "ClosingBalance",
    a.credit_limit AS "CreditLimit",
    cb.period_start AS "PeriodStart",
    cb.period_end AS "PeriodEnd",
    coalesce(cs.period_spent, 0) AS "PeriodSpent",
    coalesce(cs.estimated_cutoff_charges, 0) AS "EstimatedCutoffCharges",
    coalesce(cs.cutoff_payments, 0) AS "CutoffPayments",
    coalesce(cs.cutoff_pending, 0) AS "CutoffPending",
    coalesce(cib.msi_outstanding, 0) AS "MsiOutstanding",
    coalesce(cib.normal_outstanding, 0) AS "NormalOutstanding"
FROM accounts_scope a
LEFT JOIN month_agg m ON m.account_id = a.account_id
LEFT JOIN credit_bounds cb ON cb.account_id = a.account_id
LEFT JOIN credit_spent cs ON cs.account_id = a.account_id
LEFT JOIN credit_installment_breakdown cib ON cib.account_id = a.account_id
ORDER BY a.name;
$$;

COMMENT ON FUNCTION fn_dashboard_credit_overview(INT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, INT, INT, INT, INT)
IS 'Dashboard credit overview aligned to credit_cycles due_at / due_cycle_id';

COMMIT;

ANALYZE credit_cycles;
ANALYZE credit_charges;
ANALYZE credit_installment_plans;
ANALYZE credit_installments;
ANALYZE credit_payments;
