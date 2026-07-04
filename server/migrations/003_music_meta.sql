-- =============================================================================
-- Universal music fields: product-level genre/style/notes + aggregate "contents"
-- (track count, total length, total size), and per-track technical info that the
-- upload pipeline auto-extracts with ffprobe.
-- =============================================================================

-- Product-level music metadata (applies to single / album / beatpack alike).
CREATE TABLE IF NOT EXISTS music_meta (
  product_id       INT UNSIGNED PRIMARY KEY,
  genre            VARCHAR(64) NULL,
  style            ENUM('vocal','instruments','mixed') NULL,
  track_count      INT UNSIGNED NOT NULL DEFAULT 0,
  total_length_sec INT UNSIGNED NOT NULL DEFAULT 0,
  total_size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  notes            TEXT NULL,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mm_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Per-track style + technical info (auto-extracted on upload).
ALTER TABLE music_tracks
  ADD COLUMN style             ENUM('vocal','instruments','mixed') NULL AFTER genre,
  ADD COLUMN file_size_bytes   BIGINT UNSIGNED NULL,
  ADD COLUMN format            VARCHAR(16) NULL,
  ADD COLUMN bitrate_kbps      INT UNSIGNED NULL,
  ADD COLUMN sample_rate       INT UNSIGNED NULL,
  ADD COLUMN channels          TINYINT UNSIGNED NULL,
  ADD COLUMN original_filename VARCHAR(255) NULL;

-- Music style dropdown (distinct from clothing 'style').
INSERT IGNORE INTO attribute_options (kind, value, label, sort_order) VALUES
  ('music_style','vocal','Vocal',10),
  ('music_style','instruments','Instruments',20),
  ('music_style','mixed','Mixed',30);
