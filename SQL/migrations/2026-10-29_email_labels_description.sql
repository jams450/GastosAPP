-- Descripción de la etiqueta: qué correo pertenece aquí, en palabras del usuario.
-- Aplicación manual (sin runner automático), igual que el resto de migraciones del repo.
--
-- Idempotente a propósito. `ADD COLUMN IF NOT EXISTS` funciona tanto si la migración del clasificador
-- (`2026-10-29_email_classification_schema.sql`) ya se aplicó como si todavía no, así que no hay que
-- decidir el orden a mano ni reescribir el archivo original.
--
-- `behavior` dice QUÉ hacer con el correo. `description` dice QUÉ correo pertenece a la etiqueta, que
-- es justo lo que el nombre no alcanza a decir: «Banco» y «Gastos» se distinguen por su descripción,
-- no por su título. Solo es contexto para el respaldo LLM y el motor determinista la ignora.

ALTER TABLE email_labels
    ADD COLUMN IF NOT EXISTS description VARCHAR(500);

COMMENT ON COLUMN email_labels.description IS
    'Definición de qué correo pertenece a esta etiqueta. Contexto para el LLM, nunca una instrucción.';
