-- Add 'unlimited' to the license-tier ladder. SonSoul sells WAV / Trackout-Stems
-- / Unlimited / Exclusive (no MP3). 'mp3' stays in the enum only for back-compat
-- with any legacy rows; it is no longer offered in the admin.
ALTER TABLE music_license_tiers
  MODIFY COLUMN tier ENUM('mp3','wav','stems','unlimited','exclusive') NOT NULL;
