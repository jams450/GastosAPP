-- Explicit upgrade; NEVER run automatically. Stop all Telegram workers first.
-- Requires existing expense/income draft and durable update-ledger schema.
-- Acquire maintenance window: ALTER TABLE/index operations take locks.
BEGIN;
LOCK TABLE telegram_expense_drafts IN ACCESS EXCLUSIVE MODE;
ALTER TABLE telegram_expense_drafts
    ALTER COLUMN amount DROP NOT NULL,
    ALTER COLUMN transaction_date DROP NOT NULL,
    ADD COLUMN structured_state VARCHAR(4096),
    ADD COLUMN message_count INT NOT NULL DEFAULT 0,
    ADD COLUMN summary_ready BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE telegram_expense_drafts DROP CONSTRAINT telegram_expense_drafts_amount_check;
ALTER TABLE telegram_expense_drafts
    ADD CONSTRAINT telegram_expense_drafts_amount_check CHECK (amount IS NULL OR amount > 0),
    ADD CONSTRAINT telegram_expense_drafts_message_count_check CHECK (message_count BETWEEN 0 AND 20),
    ADD CONSTRAINT telegram_expense_drafts_state_check CHECK (structured_state IS NULL OR length(structured_state) <= 4096),
    ADD CONSTRAINT telegram_expense_drafts_confirmed_complete_check CHECK
      (status <> 'confirmed' OR (amount IS NOT NULL AND transaction_date IS NOT NULL AND account_id IS NOT NULL AND category_id IS NOT NULL));
DROP INDEX uq_telegram_expense_drafts_pending_chat;
CREATE UNIQUE INDEX uq_telegram_expense_drafts_pending_chat
    ON telegram_expense_drafts(telegram_identity_id, chat_id) WHERE status = 'pending';
COMMIT;
-- Intentionally non-idempotent: rerun fails rather than concealing schema drift.
-- Rollback after deployment needs all pending partial conversations expired/archived,
-- null amount/date rows archived or resolved, and duplicate pending chats reconciled.
-- Never manufacture missing financial facts to satisfy the old NOT NULL constraints.
