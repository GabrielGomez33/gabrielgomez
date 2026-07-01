-- =============================================================================
-- SonSoul core schema — catalog (music + clothing/accessories), orders,
-- digital delivery, PayPal linkage, admin auth.
-- MySQL 8, InnoDB, utf8mb4. Idempotent (IF NOT EXISTS).
-- =============================================================================

-- Dropdown options (genre / size / color / style / …), editable by the admin.
CREATE TABLE IF NOT EXISTS attribute_options (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind        VARCHAR(32)  NOT NULL,           -- 'genre' | 'size' | 'color' | 'style'
  value       VARCHAR(64)  NOT NULL,           -- machine value
  label       VARCHAR(128) NOT NULL,           -- display label
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attr (kind, value),
  KEY idx_attr_kind (kind, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin accounts for the creator pipeline.
CREATE TABLE IF NOT EXISTS admin_users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL,
  email         VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin') NOT NULL DEFAULT 'admin',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at TIMESTAMP    NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_admin_username (username),
  UNIQUE KEY uq_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Products: one row per sellable item (beatpack / single / album / shirt / …).
CREATE TABLE IF NOT EXISTS products (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug              VARCHAR(160) NOT NULL,
  sku               VARCHAR(64)  NULL,
  category          ENUM('music','clothing','accessory') NOT NULL,
  type              VARCHAR(32)  NOT NULL,      -- beatpack|single|album|shirt|pants|socks|accessory
  title             VARCHAR(200) NOT NULL,
  subtitle          VARCHAR(200) NULL,
  description       TEXT         NULL,
  price_cents       INT UNSIGNED NOT NULL DEFAULT 0,
  currency          CHAR(3)      NOT NULL DEFAULT 'USD',
  status            ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  is_digital        TINYINT(1)   NOT NULL DEFAULT 0,   -- music = 1, clothing = 0
  cover_image_path  VARCHAR(512) NULL,
  weight_grams      INT UNSIGNED NULL,               -- physical shipping weight
  paypal_product_id VARCHAR(64)  NULL,
  metadata          JSON         NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  published_at      TIMESTAMP    NULL,
  UNIQUE KEY uq_products_slug (slug),
  KEY idx_products_cat_status (category, status, created_at),
  KEY idx_products_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Extra gallery images (cover lives on products.cover_image_path).
CREATE TABLE IF NOT EXISTS product_images (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  path       VARCHAR(512) NOT NULL,
  alt        VARCHAR(200) NULL,
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pimg_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  KEY idx_pimg_product (product_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Music tracks: a single has 1, a beatpack/album has many.
CREATE TABLE IF NOT EXISTS music_tracks (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id    INT UNSIGNED NOT NULL,
  position      INT NOT NULL DEFAULT 0,
  name          VARCHAR(200) NOT NULL,
  artist        VARCHAR(200) NULL,
  genre         VARCHAR(64)  NULL,
  length_sec    INT UNSIGNED NULL,
  bpm           SMALLINT UNSIGNED NULL,
  music_key     VARCHAR(12)  NULL,
  master_path   VARCHAR(512) NULL,   -- full file (OUTSIDE web root)
  preview_path  VARCHAR(512) NULL,   -- 10s tagged preview (web-served)
  waveform_json JSON         NULL,   -- peaks for the waveform render
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_track_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  KEY idx_track_product (product_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional per-product license tiers for music (mp3/wav/stems/exclusive).
CREATE TABLE IF NOT EXISTS music_license_tiers (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id  INT UNSIGNED NOT NULL,
  tier        ENUM('mp3','wav','stems','exclusive') NOT NULL,
  price_cents INT UNSIGNED NOT NULL,
  file_path   VARCHAR(512) NULL,   -- deliverable for this tier (zip/stems, OUTSIDE web root)
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tier_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY uq_tier (product_id, tier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Clothing/accessory variants (size/color/style) with inventory + shipping weight.
CREATE TABLE IF NOT EXISTS product_variants (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id        INT UNSIGNED NOT NULL,
  sku               VARCHAR(64) NULL,
  size              VARCHAR(32) NULL,
  color             VARCHAR(48) NULL,
  style             VARCHAR(48) NULL,
  price_delta_cents INT NOT NULL DEFAULT 0,
  stock_qty         INT NOT NULL DEFAULT 0,
  weight_grams      INT UNSIGNED NULL,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_variant_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  KEY idx_variant_product (product_id),
  UNIQUE KEY uq_variant_sku (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Orders.
CREATE TABLE IF NOT EXISTS orders (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_number       VARCHAR(24) NOT NULL,
  email              VARCHAR(254) NOT NULL,
  status             ENUM('created','pending','paid','fulfilled','cancelled','refunded') NOT NULL DEFAULT 'created',
  currency           CHAR(3) NOT NULL DEFAULT 'USD',
  subtotal_cents     INT UNSIGNED NOT NULL DEFAULT 0,
  shipping_cents     INT UNSIGNED NOT NULL DEFAULT 0,
  tax_cents          INT UNSIGNED NOT NULL DEFAULT 0,
  total_cents        INT UNSIGNED NOT NULL DEFAULT 0,
  has_physical       TINYINT(1) NOT NULL DEFAULT 0,
  has_digital        TINYINT(1) NOT NULL DEFAULT 0,
  ship_name          VARCHAR(200) NULL,
  ship_address       JSON NULL,
  fulfillment_status ENUM('none','unfulfilled','partial','fulfilled') NOT NULL DEFAULT 'none',
  tracking_carrier   VARCHAR(64) NULL,
  tracking_number    VARCHAR(128) NULL,
  paypal_order_id    VARCHAR(64) NULL,
  paypal_capture_id  VARCHAR(64) NULL,
  ip_truncated       VARCHAR(45) NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at            TIMESTAMP NULL,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_order_number (order_number),
  KEY idx_order_status (status, created_at),
  KEY idx_order_paypal (paypal_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_items (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id           INT UNSIGNED NOT NULL,
  product_id         INT UNSIGNED NULL,
  variant_id         INT UNSIGNED NULL,
  license_tier       ENUM('mp3','wav','stems','exclusive') NULL,
  title_snapshot     VARCHAR(255) NOT NULL,
  is_digital         TINYINT(1) NOT NULL DEFAULT 0,
  unit_price_cents   INT UNSIGNED NOT NULL,
  quantity           INT UNSIGNED NOT NULL DEFAULT 1,
  fulfillment_status ENUM('none','pending','fulfilled') NOT NULL DEFAULT 'none',
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_oi_order   FOREIGN KEY (order_id)   REFERENCES orders(id)           ON DELETE CASCADE,
  CONSTRAINT fk_oi_product FOREIGN KEY (product_id) REFERENCES products(id)         ON DELETE SET NULL,
  CONSTRAINT fk_oi_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
  KEY idx_oi_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Signed, expiring, count-limited download grants for digital deliverables.
CREATE TABLE IF NOT EXISTS download_grants (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_item_id  INT UNSIGNED NOT NULL,
  token          CHAR(64) NOT NULL,
  file_path      VARCHAR(512) NOT NULL,
  max_downloads  INT NOT NULL DEFAULT 5,
  download_count INT NOT NULL DEFAULT 0,
  expires_at     TIMESTAMP NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dg_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  UNIQUE KEY uq_dg_token (token),
  KEY idx_dg_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Raw PayPal webhook log (idempotent by event_id).
CREATE TABLE IF NOT EXISTS paypal_webhooks (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id   VARCHAR(64) NOT NULL,
  event_type VARCHAR(96) NULL,
  payload    JSON NULL,
  processed  TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wh_event (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
