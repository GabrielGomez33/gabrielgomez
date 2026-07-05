-- Add 'instrumental' to the track kind enum: a full beat/instrumental (>20s),
-- alongside one-shot (1–4s) and loop (5–20s).
ALTER TABLE music_tracks
  MODIFY COLUMN kind ENUM('one_shot','loop','instrumental','unknown') NULL;
