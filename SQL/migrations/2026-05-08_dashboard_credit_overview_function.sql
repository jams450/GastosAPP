BEGIN;

-- Optional performance indexes for dashboard aggregates
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_group_transaction_id
    ON transactions(transfer_group_id, transaction_id)
    WHERE transfer_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_installments_status
    ON credit_installments(status);

CREATE INDEX IF NOT EXISTS idx_credit_payments_status
    ON credit_payments(status);

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
        CASE WHEN a.is_credit THEN (make_date(p_year_value, p_month_value, LEAST(GREATEST(coalesce(a.due_day, p_days_in_month), 1), p_days_in_month)) + INTERVAL '1 day')::date END AS payment_start,
        CASE WHEN a.is_credit THEN make_date(
            EXTRACT(YEAR FROM p_next_month_start)::int,
            EXTRACT(MONTH FROM p_next_month_start)::int,
            LEAST(
                GREATEST(
                    coalesce(a.payment_due_day, 1),
                    1
                ),
                EXTRACT(DAY FROM ((date_trunc('month', p_next_month_start) + INTERVAL '1 month') - INTERVAL '1 day'))::int
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
            AND cbm.payment_start IS NOT NULL
            AND cbm.payment_end IS NOT NULL
            AND ci.due_date >= cbm.payment_start
            AND ci.due_date < (cbm.payment_end + INTERVAL '1 day')
        LEFT JOIN (
            SELECT
                ia.installment_id,
                coalesce(sum(ia.allocated_amount), 0) AS allocated_total
            FROM installment_allocations ia
            INNER JOIN credit_payments cp ON cp.payment_id = ia.payment_id AND cp.status = 'Posted'
            GROUP BY ia.installment_id
        ) ip ON ip.installment_id = ci.installment_id
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
IS 'Dashboard credit overview source query extracted from DashboardService raw SQL';

COMMIT;

ANALYZE transactions;
ANALYZE credit_installments;
ANALYZE credit_payments;
