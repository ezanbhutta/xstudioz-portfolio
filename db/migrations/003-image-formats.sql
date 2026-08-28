-- Which formats an uploaded image was actually written in.
--
-- The site now writes AVIF beside every WebP, and offers it through a
-- <picture> source. That source has to be right: a browser does not fall back
-- from a <source> that 404s, so advertising an AVIF that was never written is
-- a broken image rather than a slower one. Encoding is best-effort — the host
-- has refused work before — so what happened is recorded rather than assumed.
--
-- 'webp' is the default and the honest answer for every row that predates
-- this: their AVIF does not exist until scripts/backfill-images.mjs writes it.
--
-- Additive and idempotent, and the code reads the column defensively — a
-- server deployed before this runs simply sees no formats and serves WebP, so
-- the order of migration and deploy does not matter.
ALTER TABLE project_images
  ADD COLUMN IF NOT EXISTS formats VARCHAR(40) NOT NULL DEFAULT 'webp';
