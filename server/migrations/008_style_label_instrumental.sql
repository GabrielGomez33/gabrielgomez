-- "Instrumental" reads better than "Instruments" for the music style / song-vs-
-- beat distinction. The stored value stays 'instruments' (code + data unchanged);
-- only the human label updates.
UPDATE attribute_options
   SET label = 'Instrumental'
 WHERE kind = 'music_style' AND value = 'instruments';
