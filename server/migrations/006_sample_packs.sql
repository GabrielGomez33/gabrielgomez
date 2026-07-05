-- =============================================================================
-- Sample packs. A new music `type` = 'samplepack' whose tracks are individual
-- samples (one-shots / loops), auto-classified on upload. Only a small curated
-- "preview set" (~10) gets a public preview; the rest ship in the download.
-- These per-track columns apply to ALL music (beatpacks/albums benefit from the
-- same folder analysis), not just sample packs.
-- =============================================================================
ALTER TABLE music_tracks
  ADD COLUMN kind            ENUM('one_shot','loop','unknown') NULL AFTER style,
  ADD COLUMN sample_group    VARCHAR(24)  NULL AFTER kind,     -- drums / bass / melodic / vocal / fx / other
  ADD COLUMN sample_category VARCHAR(32)  NULL AFTER sample_group, -- kick / snare / hat / 808 / lead / pad ...
  ADD COLUMN is_preview      TINYINT(1)   NOT NULL DEFAULT 0 AFTER sample_category,
  ADD COLUMN rel_dir         VARCHAR(255) NULL,                -- folder path within the uploaded folder
  ADD COLUMN bpm_source      VARCHAR(12)  NULL,                -- filename / dsp / manual
  ADD COLUMN key_source      VARCHAR(12)  NULL;

ALTER TABLE music_tracks
  ADD KEY idx_track_preview (product_id, is_preview);

-- Coarse sample groups (for the admin reclassify dropdown + storefront sections).
INSERT IGNORE INTO attribute_options (kind, value, label, sort_order) VALUES
  ('sample_group','drums','Drums',10),
  ('sample_group','bass','Bass',20),
  ('sample_group','melodic','Melodic',30),
  ('sample_group','vocal','Vocal',40),
  ('sample_group','fx','FX',50),
  ('sample_group','other','Other',60);
