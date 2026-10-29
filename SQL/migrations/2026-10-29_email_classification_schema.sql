-- Clasificador de correo: etiquetas, reglas, mensajes clasificados y borradores de gasto.
-- Aplicación manual (sin runner automático), igual que el resto de migraciones del repo.
--
-- Nada de esto escribe en `transactions`: un correo produce un borrador y el alta real sigue siendo
-- una confirmación humana, igual que en `telegram_expense_drafts`.
--
-- Orden: email_labels -> email_rules -> email_messages -> email_expense_drafts.

CREATE TABLE email_labels (
    label_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(80) NOT NULL,
    slug VARCHAR(80) NOT NULL,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('folder', 'label')),
    -- El comportamiento vive en la etiqueta, no en su nombre: «Otros» es una etiqueta con
    -- behavior = 'none', no un caso especial del motor de reglas.
    behavior VARCHAR(10) NOT NULL CHECK (behavior IN ('expense', 'income', 'ignore', 'none')),
    color VARCHAR(7),
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 100,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_email_labels_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT uq_email_labels_user_slug UNIQUE (user_id, slug)
);

CREATE INDEX idx_email_labels_user_active ON email_labels(user_id, active, sort_order);

CREATE TABLE email_rules (
    email_rule_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(120) NOT NULL,
    match_field VARCHAR(20) NOT NULL CHECK (match_field IN ('sender', 'sender_domain', 'subject')),
    match_type VARCHAR(20) NOT NULL CHECK (match_type IN ('equals', 'contains', 'starts_with', 'ends_with')),
    -- Normalizado al escribir (minúsculas, sin acentos, espacios colapsados), igual que catalog_rules.
    match_value VARCHAR(200) NOT NULL,
    target_label_id INT NOT NULL,
    -- Menor gana; el empate se resuelve por email_rule_id.
    priority INT NOT NULL DEFAULT 100,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    -- Correo del que nació la regla cuando se creó desde la bandeja de sin clasificar.
    created_from_message_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_email_rules_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_email_rules_target_label FOREIGN KEY (target_label_id) REFERENCES email_labels(label_id) ON DELETE RESTRICT
);

CREATE INDEX idx_email_rules_user_active_priority ON email_rules(user_id, active, priority);

CREATE TABLE email_messages (
    email_message_id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    -- Clave de idempotencia: el Message-ID de RFC 822. Un UID de IMAP no sirve porque está
    -- calificado por UIDVALIDITY y se corre cuando el servidor lo cambia.
    message_id VARCHAR(255) NOT NULL,
    mailbox VARCHAR(120) NOT NULL,
    uid BIGINT,
    sender_address VARCHAR(320),
    sender_domain VARCHAR(255),
    subject VARCHAR(500),
    received_at TIMESTAMPTZ NOT NULL,
    -- Cuerpo ya extraído en texto y acotado. Lo consume el extractor; no es el archivo del correo.
    body_text TEXT,
    state VARCHAR(20) NOT NULL CHECK (state IN ('pending', 'classified', 'drafted', 'review', 'ignored', 'failed')),
    label_id INT,
    matched_rule_id INT,
    classified_by VARCHAR(10) CHECK (classified_by IN ('rule', 'llm', 'none')),
    attempt_count INT NOT NULL DEFAULT 0,
    failure_reason VARCHAR(500),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_email_messages_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_email_messages_label FOREIGN KEY (label_id) REFERENCES email_labels(label_id) ON DELETE SET NULL,
    CONSTRAINT fk_email_messages_rule FOREIGN KEY (matched_rule_id) REFERENCES email_rules(email_rule_id) ON DELETE SET NULL,
    CONSTRAINT uq_email_messages_user_message UNIQUE (user_id, message_id),
    CONSTRAINT ck_email_messages_body_size CHECK (body_text IS NULL OR length(body_text) <= 40000)
);

CREATE INDEX idx_email_messages_user_state ON email_messages(user_id, state);
CREATE INDEX idx_email_messages_user_received ON email_messages(user_id, received_at DESC);

CREATE TABLE email_expense_drafts (
    draft_id UUID PRIMARY KEY,
    user_id INT NOT NULL,
    email_message_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'confirmed', 'discarded', 'expired')),
    intent VARCHAR(20) NOT NULL CHECK (intent IN ('expense', 'income')),
    amount NUMERIC(15,2) CONSTRAINT email_expense_drafts_amount_check CHECK (amount IS NULL OR amount > 0),
    currency_code VARCHAR(3),
    transaction_date TIMESTAMPTZ,
    account_id INT,
    category_id INT,
    subcategory_id INT,
    merchant_id INT,
    raw_account_name VARCHAR(150),
    -- Pista de la tarjeta con la que se pagó. Con PayPal el gasto vive en la tarjeta de fondo, y hay
    -- tarjetas que no son cuentas de la app: el texto queda aquí hasta que exista un catálogo.
    raw_card_name VARCHAR(150),
    raw_category_name VARCHAR(150),
    raw_merchant_name VARCHAR(150),
    description VARCHAR(500),
    extraction_source VARCHAR(20) NOT NULL CHECK (extraction_source IN ('rule', 'llm', 'none')),
    expires_at TIMESTAMPTZ NOT NULL,
    confirmed_at TIMESTAMPTZ,
    transaction_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_email_expense_drafts_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_email_expense_drafts_message FOREIGN KEY (email_message_id) REFERENCES email_messages(email_message_id) ON DELETE CASCADE,
    CONSTRAINT fk_email_expense_drafts_account FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE SET NULL,
    CONSTRAINT fk_email_expense_drafts_category FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE SET NULL,
    CONSTRAINT fk_email_expense_drafts_subcategory FOREIGN KEY (subcategory_id) REFERENCES subcategories(subcategory_id) ON DELETE SET NULL,
    CONSTRAINT fk_email_expense_drafts_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id) ON DELETE SET NULL,
    CONSTRAINT fk_email_expense_drafts_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE SET NULL,
    -- Espejo de telegram_expense_drafts: confirmar exige lo que `transactions` exige de verdad.
    CONSTRAINT email_expense_drafts_confirmed_complete_check CHECK
      (status <> 'confirmed' OR (amount IS NOT NULL AND transaction_date IS NOT NULL AND account_id IS NOT NULL AND currency_code IS NOT NULL)),
    -- Un borrador por mensaje: un correo no produce dos gastos.
    CONSTRAINT uq_email_expense_drafts_message UNIQUE (email_message_id)
);

CREATE INDEX idx_email_expense_drafts_user_status ON email_expense_drafts(user_id, status);
CREATE INDEX idx_email_expense_drafts_expires_at ON email_expense_drafts(expires_at);
