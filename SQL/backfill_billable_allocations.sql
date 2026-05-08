-- 1) Ensure each user has a SELF billable party
INSERT INTO billable_parties (owner_user_id, linked_user_id, type, display_name, normalized_name, active, created_at)
SELECT u.user_id,
       u.user_id,
       'self',
       COALESCE(NULLIF(TRIM(u.name), ''), 'Propio') AS display_name,
       LOWER(COALESCE(NULLIF(TRIM(u.name), ''), 'Propio')) AS normalized_name,
       TRUE,
       NOW()
FROM users u
WHERE NOT EXISTS (
    SELECT 1
    FROM billable_parties bp
    WHERE bp.owner_user_id = u.user_id
      AND bp.type = 'self'
);

-- 2) Backfill historical expenses with 100% SELF allocation
INSERT INTO transaction_allocations (
    transaction_id,
    billable_party_id,
    allocation_mode,
    allocation_value,
    calculated_amount,
    billable_party_snapshot_name,
    created_at
)
SELECT t.transaction_id,
       bp.billable_party_id,
       'percentage',
       100,
       t.amount,
       bp.display_name,
       NOW()
FROM transactions t
INNER JOIN accounts a ON a.account_id = t.account_id
INNER JOIN billable_parties bp ON bp.owner_user_id = a.user_id
                              AND bp.type = 'self'
                              AND bp.active = TRUE
WHERE LOWER(t.type) = 'expense'
  AND NOT EXISTS (
      SELECT 1
      FROM transaction_allocations ta
      WHERE ta.transaction_id = t.transaction_id
  );
