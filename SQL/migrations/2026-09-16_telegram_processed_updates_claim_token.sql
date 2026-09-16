-- Ownership de lease en el ledger de updates de Telegram.
-- claim_token identifica al dueño vigente del lease: solo ese worker puede cerrar
-- el update (MarkDone/MarkFailed) y el reclaim regenera el token.
-- Aplicación manual (sin runner automático), igual que el resto de migraciones del repo.

ALTER TABLE telegram_processed_updates
    ADD COLUMN claim_token UUID;

-- Backfill determinista para filas preexistentes (sin extensiones: md5 -> 32 hex = uuid).
UPDATE telegram_processed_updates
SET claim_token = md5(update_id::text)::uuid
WHERE claim_token IS NULL;

ALTER TABLE telegram_processed_updates
    ALTER COLUMN claim_token SET NOT NULL;
