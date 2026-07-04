-- =============================================================================
-- Customer accounts (optional; guest checkout also supported). Orders link to a
-- customer when present, else stand alone keyed by email — so a guest can later
-- register with that email and see their history.
-- =============================================================================

CREATE TABLE IF NOT EXISTS customers (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email            VARCHAR(254) NOT NULL,
  password_hash    VARCHAR(255) NOT NULL,
  name             VARCHAR(120) NULL,
  email_verified   TINYINT(1) NOT NULL DEFAULT 0,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  marketing_opt_in TINYINT(1) NOT NULL DEFAULT 0,
  last_login_at    TIMESTAMP NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cust_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verification + reset tokens. We store the SHA-256 HASH of the token, never the
-- token itself — a DB leak can't be replayed. The raw token only lives in the
-- emailed link. Single-use via `used`.
CREATE TABLE IF NOT EXISTS customer_tokens (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  purpose     ENUM('verify','reset') NOT NULL,
  used        TINYINT(1) NOT NULL DEFAULT 0,
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ct_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  UNIQUE KEY uq_ct_hash (token_hash),
  KEY idx_ct_customer (customer_id, purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Link orders to an account when the buyer has one (nullable = guest).
ALTER TABLE orders
  ADD COLUMN customer_id INT UNSIGNED NULL AFTER email,
  ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
