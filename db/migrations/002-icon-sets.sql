-- Icon sets.
--
-- Import in phpMyAdmin AFTER 001-runtime-images.sql. Safe to re-run.
--
-- Why this exists
-- ---------------
-- A project's images were only ever the pages of a PDF: one document, read in
-- order, one full-width column. Some work is not a document. A set of icons is
-- twenty separate marks that happen to have been drawn for one client — they
-- share an industry and nothing else, each is its own kind of logo, and
-- stacking them full-width down a page reads them as a story they are not.
--
-- The pages themselves arrive exactly as before: one PDF, one icon per page.
-- Nothing about the upload changes. What changes is what a page is allowed to
-- mean, and how the case study lays them out.
--
-- Every column here is nullable or defaulted, so the eight existing projects
-- and their 238 image rows are untouched and keep behaving as decks.

-- How a project's images should be read ---------------------------------------
--
-- 'deck'  — pages of a document, in order, one column. The default, and what
--           every project is today.
-- 'icons' — a set of separate marks, laid out as a grid, each captioned with
--           its own name and kind.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS layout ENUM('deck','icons') NOT NULL DEFAULT 'deck'
    COMMENT 'How the case study lays out its images';

-- Per-image identity ----------------------------------------------------------
--
-- A deck page is "page 7 of 45" and needs no name of its own. An icon is a
-- thing with a name and a kind, and those differ within one set — which is the
-- whole reason a set cannot be described by the project's single logo_type.
--
-- Deliberately NOT a foreign key to a taxonomy table. These are descriptive
-- captions, not filters: the public Type filter still reads the project's own
-- logo_type, so an icon set stays one entry under one service. Making these
-- joinable would be the first step toward a project answering to several
-- categories at once, which is a much larger change and is not wanted.
ALTER TABLE project_images
  ADD COLUMN IF NOT EXISTS label     VARCHAR(120) NULL
    COMMENT 'The icon''s own name, e.g. "Sunrise Yoga". Null for deck pages.',
  ADD COLUMN IF NOT EXISTS logo_type VARCHAR(40)  NULL
    COMMENT 'This icon''s kind, from LOGO_TYPES. Null for deck pages.';
