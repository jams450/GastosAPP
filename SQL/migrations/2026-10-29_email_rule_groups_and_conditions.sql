-- Grupos y condiciones de las reglas de correo: AND/OR anidados de verdad.
-- Aplicación manual (sin runner automático), igual que el resto de migraciones del repo.
--
-- Aditiva a propósito: no toca `email_rules.match_*` ni migra datos. Una regla sin filas en
-- `email_rule_groups` se sigue evaluando con sus columnas actuales, así que este archivo puede
-- aplicarse sin romper nada. El respaldo de las reglas existentes al modelo nuevo y el retiro de las
-- columnas viejas van en un paso posterior, cuando la API ya escriba grupos.
--
-- Por qué una tabla de grupos y no solo condiciones: el caso real es
-- `dominio = mercadolibre.com Y (asunto contiene compraste O asunto contiene pagaste)`, y eso no se
-- expresa con una lista plana. Cada grupo combina con su propio operador a sus condiciones y a sus
-- subgrupos.

CREATE TABLE IF NOT EXISTS email_rule_groups (
    group_id SERIAL PRIMARY KEY,
    email_rule_id INT NOT NULL,
    parent_group_id INT,
    -- Se llama `combinator` y no `operator` porque OPERATOR es palabra reservada en PostgreSQL.
    combinator VARCHAR(3) NOT NULL CHECK (combinator IN ('and', 'or')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_email_rule_groups_rule FOREIGN KEY (email_rule_id)
        REFERENCES email_rules(email_rule_id) ON DELETE CASCADE,
    CONSTRAINT fk_email_rule_groups_parent FOREIGN KEY (parent_group_id)
        REFERENCES email_rule_groups(group_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_rule_groups_rule
    ON email_rule_groups(email_rule_id, parent_group_id);

-- Un solo grupo raíz por regla: si hubiera dos, la evaluación tendría que elegir uno y la regla
-- dejaría de tener un significado único.
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_rule_groups_root
    ON email_rule_groups(email_rule_id) WHERE parent_group_id IS NULL;

CREATE TABLE IF NOT EXISTS email_rule_conditions (
    condition_id SERIAL PRIMARY KEY,
    group_id INT NOT NULL,
    match_field VARCHAR(20) NOT NULL CHECK (match_field IN ('sender', 'sender_domain', 'subject')),
    match_type VARCHAR(20) NOT NULL CHECK (match_type IN ('equals', 'contains', 'starts_with', 'ends_with')),
    -- Normalizado al escribir, igual que email_rules.match_value.
    match_value VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_email_rule_conditions_group FOREIGN KEY (group_id)
        REFERENCES email_rule_groups(group_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_rule_conditions_group
    ON email_rule_conditions(group_id);
