-- Read-only reconciliation. Caller must enforce owner and transaction safety.
-- :user_id is bound by the reader, never interpolated.
-- Persisted impacts and dashboard legacy fallback are deliberately separate.
WITH owner_accounts AS (
    SELECT * FROM accounts WHERE user_id = :user_id
), owner_transactions AS (
    SELECT t.* FROM transactions t
    JOIN owner_accounts a ON a.account_id = t.account_id
), transfer_rank AS (
    SELECT transaction_id,
        row_number() OVER (PARTITION BY transfer_group_id ORDER BY transaction_id) AS rn,
        count(*) OVER (PARTITION BY transfer_group_id) AS n
    FROM owner_transactions
    WHERE lower(type) = 'transfer' AND transfer_group_id IS NOT NULL
), movement AS (
    SELECT t.account_id, t.transaction_id, t.balance_impact,
        CASE WHEN t.balance_impact <> 0 THEN t.balance_impact
             WHEN lower(t.type) = 'income' THEN t.amount
             WHEN lower(t.type) = 'expense' THEN -t.amount
             WHEN lower(t.type) = 'transfer' AND t.transfer_group_id IS NULL THEN t.amount
             WHEN lower(t.type) = 'transfer' THEN
                 CASE WHEN r.n < 2 THEN t.amount WHEN r.rn = 1 THEN -t.amount ELSE t.amount END
             ELSE 0 END AS reconstructed_impact,
        CASE WHEN t.balance_impact = 0 AND lower(t.type) IN ('income','expense','transfer') THEN 1 ELSE 0 END AS fallback_count,
        CASE WHEN lower(t.type) = 'opening_credit' THEN t.amount ELSE 0 END AS opening_credit_amount
    FROM owner_transactions t LEFT JOIN transfer_rank r ON r.transaction_id = t.transaction_id
), movement_totals AS (
    SELECT account_id, count(*) AS movement_count,
        sum(balance_impact) AS persisted_impact,
        sum(reconstructed_impact) AS reconstructed_impact,
        sum(fallback_count) AS fallback_count,
        sum(opening_credit_amount) AS opening_credit_amount
    FROM movement GROUP BY account_id
), posted_allocations AS (
    SELECT ia.installment_id, sum(ia.allocated_amount) AS paid,
        sum(CASE WHEN cp.account_id <> p.account_id THEN 1 ELSE 0 END) AS cross_account_allocations
    FROM installment_allocations ia
    JOIN credit_payments cp ON cp.payment_id = ia.payment_id AND cp.status = 'Posted'
    JOIN credit_installments ci ON ci.installment_id = ia.installment_id
    JOIN credit_installment_plans p ON p.plan_id = ci.plan_id
    JOIN owner_accounts a ON a.account_id = p.account_id
    GROUP BY ia.installment_id
), installment_rows AS (
    SELECT p.account_id, p.plan_type, ci.status,
        ci.total_due, coalesce(pa.paid,0) AS paid,
        CASE WHEN ci.total_due > coalesce(pa.paid,0) THEN ci.total_due - coalesce(pa.paid,0) ELSE 0 END AS outstanding,
        CASE WHEN coalesce(pa.paid,0) > ci.total_due THEN coalesce(pa.paid,0) - ci.total_due ELSE 0 END AS overallocated,
        coalesce(pa.cross_account_allocations,0) AS cross_account_allocations
    FROM credit_installments ci
    JOIN credit_installment_plans p ON p.plan_id = ci.plan_id
    JOIN owner_accounts a ON a.account_id = p.account_id
    LEFT JOIN posted_allocations pa ON pa.installment_id = ci.installment_id
), debt AS (
    SELECT account_id,
        sum(CASE WHEN status IN ('Open','PartiallyPaid','Overdue') AND plan_type = 'Revolving' THEN outstanding ELSE 0 END) AS normal_debt,
        sum(CASE WHEN status IN ('Open','PartiallyPaid','Overdue') AND plan_type = 'MSI' THEN outstanding ELSE 0 END) AS msi_debt,
        sum(overallocated) AS overallocated,
        sum(CASE WHEN status = 'Paid' THEN outstanding ELSE 0 END) AS paid_status_residual,
        sum(cross_account_allocations) AS cross_account_allocations
    FROM installment_rows GROUP BY account_id
)
SELECT a.account_id, a.name, a.active, a.credit_limit, a.initial_balance, a.current_balance,
    coalesce(m.movement_count,0) AS movement_count,
    coalesce(m.persisted_impact,0) AS persisted_impact,
    coalesce(m.reconstructed_impact,0) AS reconstructed_impact,
    a.current_balance - a.initial_balance - coalesce(m.persisted_impact,0) AS persisted_residual,
    a.current_balance - a.initial_balance - coalesce(m.reconstructed_impact,0) AS reconstructed_residual,
    coalesce(m.fallback_count,0) AS fallback_count,
    coalesce(m.opening_credit_amount,0) AS opening_credit_amount,
    coalesce(d.normal_debt,0) AS normal_debt, coalesce(d.msi_debt,0) AS msi_debt,
    coalesce(d.normal_debt,0) + coalesce(d.msi_debt,0) AS total_debt,
    a.credit_limit - coalesce(d.normal_debt,0) - coalesce(d.msi_debt,0) AS available,
    coalesce(d.overallocated,0) AS overallocated,
    coalesce(d.paid_status_residual,0) AS paid_status_residual,
    coalesce(d.cross_account_allocations,0) AS cross_account_allocations
FROM owner_accounts a
LEFT JOIN movement_totals m ON m.account_id = a.account_id
LEFT JOIN debt d ON d.account_id = a.account_id
WHERE a.is_credit = TRUE
ORDER BY a.account_id;
