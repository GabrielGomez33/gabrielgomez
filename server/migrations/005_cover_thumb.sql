-- Normalized cover pipeline: alongside the full cover we now keep a small,
-- square thumbnail (used in the admin list/editor and could back a grid later).
-- Covers are normalized to WebP on upload, so cover_image_path now points at a
-- .webp; this column points at the matching *_thumb.webp.
ALTER TABLE products
  ADD COLUMN cover_thumb_path VARCHAR(512) NULL AFTER cover_image_path;
