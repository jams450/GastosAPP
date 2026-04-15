-- Analytics dimensions rollout: subcategories, merchants, tags
-- Safe to run on existing database.

BEGIN;

CREATE TABLE IF NOT EXISTS subcategories (
    subcategory_id SERIAL PRIMARY KEY,
    user_id INT,
    category_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    normalized_name VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_subcategories_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT fk_subcategories_category FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE,
    CONSTRAINT uq_subcategories_unique UNIQUE (user_id, category_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS merchants (
    merchant_id SERIAL PRIMARY KEY,
    user_id INT,
    name VARCHAR(120) NOT NULL,
    normalized_name VARCHAR(120) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_merchants_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT uq_merchants_unique UNIQUE (user_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS tags (
    tag_id SERIAL PRIMARY KEY,
    user_id INT,
    name VARCHAR(80) NOT NULL,
    normalized_name VARCHAR(80) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_tags_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT uq_tags_unique UNIQUE (user_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS category_tags (
    category_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (category_id, tag_id),
    CONSTRAINT fk_category_tags_category FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE,
    CONSTRAINT fk_category_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
);

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS subcategory_id INT,
    ADD COLUMN IF NOT EXISTS merchant_id INT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_transactions_subcategory'
          AND table_name = 'transactions'
    ) THEN
        ALTER TABLE transactions
            ADD CONSTRAINT fk_transactions_subcategory
            FOREIGN KEY (subcategory_id) REFERENCES subcategories(subcategory_id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_transactions_merchant'
          AND table_name = 'transactions'
    ) THEN
        ALTER TABLE transactions
            ADD CONSTRAINT fk_transactions_merchant
            FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS transaction_tags (
    transaction_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (transaction_id, tag_id),
    CONSTRAINT fk_transaction_tags_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    CONSTRAINT fk_transaction_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
);

-- Backfill: create generic subcategory "General" for each existing category
INSERT INTO subcategories (user_id, category_id, name, normalized_name, active, created_at, updated_at)
SELECT c.user_id,
       c.category_id,
       'General',
       'general',
       TRUE,
       NOW(),
       NOW()
FROM categories c
WHERE NOT EXISTS (
    SELECT 1
    FROM subcategories s
    WHERE s.category_id = c.category_id
      AND s.normalized_name = 'general'
      AND ((s.user_id IS NULL AND c.user_id IS NULL) OR s.user_id = c.user_id)
);

-- Backfill transactions that have category but no subcategory
UPDATE transactions t
SET subcategory_id = s.subcategory_id
FROM subcategories s
WHERE t.category_id = s.category_id
  AND s.normalized_name = 'general'
  AND t.category_id IS NOT NULL
  AND t.subcategory_id IS NULL
  AND ((s.user_id IS NULL) OR EXISTS (
      SELECT 1
      FROM accounts a
      WHERE a.account_id = t.account_id
        AND a.user_id = s.user_id
  ));

CREATE INDEX IF NOT EXISTS idx_transactions_subcategory ON transactions(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_subcategory_date ON transactions(subcategory_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_date ON transactions(merchant_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_subcategories_user ON subcategories(user_id);
CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_merchants_user ON merchants(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_normalized ON tags(normalized_name);
CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON transaction_tags(tag_id);

COMMIT;
