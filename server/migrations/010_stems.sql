-- Stems / trackouts. A beat's stems live under products/<id>/masters/stems/ and
-- are delivered only for the Trackout/Stems, Unlimited, and Exclusive tiers.
-- stems_available: 1 = stems uploaded (Stems tier sellable); 0 = flagged "no
-- stems available" (legacy — Stems tier greyed out); NULL = not applicable /
-- not yet decided.
ALTER TABLE products
  ADD COLUMN stems_available TINYINT(1) NULL AFTER is_digital;
