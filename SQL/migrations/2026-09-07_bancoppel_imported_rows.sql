CREATE TABLE bancoppel_imported_rows (
    imported_row_id SERIAL PRIMARY KEY,
    account_id INT NOT NULL,
    fingerprint VARCHAR(64) NOT NULL,
    transaction_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT uq_bancoppel_imported_rows_account_fingerprint UNIQUE (account_id, fingerprint),
    CONSTRAINT fk_bancoppel_imported_rows_account FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    CONSTRAINT fk_bancoppel_imported_rows_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE SET NULL
);

CREATE INDEX idx_bancoppel_imported_rows_transaction ON bancoppel_imported_rows(transaction_id);
