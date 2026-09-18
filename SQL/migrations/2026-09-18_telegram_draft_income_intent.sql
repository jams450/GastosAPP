-- Borrador de Telegram: amplía el CHECK de intent para admitir ingresos.
-- El CHECK era inline (sin nombre explícito), por lo que Postgres lo nombró
-- telegram_expense_drafts_intent_check al crear la tabla. Ahora acepta 'expense' e 'income'.
-- Aplicación manual (sin runner automático), igual que el resto de migraciones del repo.

ALTER TABLE telegram_expense_drafts
    DROP CONSTRAINT IF EXISTS telegram_expense_drafts_intent_check;

ALTER TABLE telegram_expense_drafts
    ADD CONSTRAINT telegram_expense_drafts_intent_check CHECK (intent IN ('expense', 'income'));
