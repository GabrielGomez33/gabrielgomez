-- =============================================================================
-- Seed default dropdown options. Idempotent (INSERT IGNORE on unique kind+value).
-- The admin can add/deactivate more at runtime.
-- =============================================================================

INSERT IGNORE INTO attribute_options (kind, value, label, sort_order) VALUES
  ('genre','hip-hop','Hip-Hop',10),
  ('genre','trap','Trap',20),
  ('genre','rnb','R&B',30),
  ('genre','soul','Soul',40),
  ('genre','lo-fi','Lo-Fi',50),
  ('genre','cloud','Cloud',60),
  ('genre','ambient','Ambient',70),
  ('genre','alternative','Alternative',80),
  ('genre','ethereal','Ethereal',90),
  ('genre','experimental','Experimental',100),
  ('genre','drill','Drill',110),
  ('genre','afrobeat','Afrobeat',120),
  ('genre','pop','Pop',130);

INSERT IGNORE INTO attribute_options (kind, value, label, sort_order) VALUES
  ('size','xs','XS',10),
  ('size','s','S',20),
  ('size','m','M',30),
  ('size','l','L',40),
  ('size','xl','XL',50),
  ('size','xxl','XXL',60),
  ('size','os','One Size',70);

INSERT IGNORE INTO attribute_options (kind, value, label, sort_order) VALUES
  ('color','black','Black',10),
  ('color','white','White',20),
  ('color','grey','Grey',30),
  ('color','bone','Bone',40),
  ('color','charcoal','Charcoal',50);

INSERT IGNORE INTO attribute_options (kind, value, label, sort_order) VALUES
  ('style','regular','Regular',10),
  ('style','oversized','Oversized',20),
  ('style','slim','Slim',30),
  ('style','cropped','Cropped',40),
  ('style','relaxed','Relaxed',50);
