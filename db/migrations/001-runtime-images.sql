-- Runtime-uploaded images.
--
-- Import in phpMyAdmin AFTER schema.sql and seed.sql. Safe to re-run.
--
-- Why this exists
-- ---------------
-- Images were resolved through Astro's `import.meta.glob`, which Vite freezes
-- at build time. A deck uploaded while the server is running is therefore
-- invisible: the file is on disk, the row is in the table, and the page
-- renders without it — silently, with no error. That was proven by putting a
-- real PNG and a real row in place against a running server and watching the
-- figure count stay at 35.
--
-- So uploaded images bypass Astro's pipeline and are served as plain files.
-- That costs the build-time optimisation, which is bought back by generating
-- the WebP variants at upload instead, and it costs the intrinsic dimensions
-- Astro used to supply — which is what these columns restore.
--
-- Without width and height the browser cannot reserve space before the image
-- arrives, so every deck page would shove the one below it down as it loads.
-- On a thirty-six page case study that is thirty-six jolts.

-- Deck pages -----------------------------------------------------------------
ALTER TABLE project_images
  ADD COLUMN IF NOT EXISTS width  INT NULL COMMENT 'Intrinsic px width, for aspect-ratio reservation',
  ADD COLUMN IF NOT EXISTS height INT NULL COMMENT 'Intrinsic px height';

-- Grid cover -----------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS cover_width  INT NULL,
  ADD COLUMN IF NOT EXISTS cover_height INT NULL;

-- Where the file actually is.
--
-- 'asset'  — under src/content/projects/<slug>/, resolved by the build glob.
--            The eight original projects, until they are migrated.
-- 'upload' — under the uploads directory, served as a plain file. Everything
--            uploaded through the admin.
--
-- Keeping both lets the migration run project by project and be verified,
-- rather than being a single switch that either works or loses the portfolio.
ALTER TABLE project_images
  ADD COLUMN IF NOT EXISTS storage ENUM('asset','upload') NOT NULL DEFAULT 'asset';

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS cover_storage ENUM('asset','upload') NOT NULL DEFAULT 'asset';
