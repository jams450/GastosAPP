-- Acciones terminales (S15) y negación (S14) en las reglas de correo.
-- Aplicación manual (sin runner automático), igual que el resto de migraciones del repo.
--
-- Aditiva y sin reescritura de filas: `action` arranca en el valor histórico `assign_label` y
-- `negated` en FALSE, así que toda regla vigente se evalúa exactamente igual que antes de este
-- archivo. No se toca ninguna migración anterior ni las restricciones de `match_field`, `match_type`
-- y `match_value`.
--
-- Por qué `target_label_id` deja de ser NOT NULL: una regla terminal (review/llm) no nombra etiqueta.
-- Guardar una etiqueta falsa para satisfacer el NOT NULL haría que algo la aplicara sin que nadie lo
-- pidiera; el CHECK de abajo es el que dice la verdad completa —solo `assign_label` lleva etiqueta y
-- la exige—. La FK `fk_email_rules_target_label` se conserva intacta: una columna nullable sigue
-- referenciando `email_labels` igual que antes.

ALTER TABLE email_rules
    ADD COLUMN IF NOT EXISTS action VARCHAR(20) NOT NULL DEFAULT 'assign_label';

ALTER TABLE email_rules
    ALTER COLUMN target_label_id DROP NOT NULL;

-- Idempotente a propósito: ADD CONSTRAINT no admite IF NOT EXISTS en PostgreSQL, así que se consulta
-- el catálogo antes. Re-ejecutar el archivo no falla y no cambia nada.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_email_rules_action' AND conrelid = 'email_rules'::regclass
    ) THEN
        ALTER TABLE email_rules
            ADD CONSTRAINT ck_email_rules_action CHECK (action IN ('assign_label', 'review', 'llm'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_email_rules_action_target' AND conrelid = 'email_rules'::regclass
    ) THEN
        ALTER TABLE email_rules
            ADD CONSTRAINT ck_email_rules_action_target CHECK (
                (action = 'assign_label' AND target_label_id IS NOT NULL)
                OR (action <> 'assign_label' AND target_label_id IS NULL)
            );
    END IF;
END
$$;

-- El «NO» es un booleano en la condición y en el grupo, no un comparador nuevo: «no_contiene»,
-- «no_empieza_con» y sus combinaciones multiplican los comparadores y el motor deja de ser auditable.
ALTER TABLE email_rule_groups
    ADD COLUMN IF NOT EXISTS negated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE email_rule_conditions
    ADD COLUMN IF NOT EXISTS negated BOOLEAN NOT NULL DEFAULT FALSE;
