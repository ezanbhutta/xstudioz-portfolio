-- XStudioz portfolio — MySQL schema for Hostinger
--
-- Import this ONCE in hPanel → phpMyAdmin, with your database selected.
-- It is safe to re-run: every statement is guarded.
--
-- Character set is utf8mb4 throughout because project copy contains real
-- punctuation (curly quotes, ·, é) that latin1 silently corrupts.
--
-- MySQL has no array type, so list fields are JSON columns. Every one is
-- NOT NULL with a '[]' default, so reading code never has to distinguish
-- "empty" from "missing" — the same rule the JSON content files follow.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- Services. The five things the studio sells. Drives the nav, the footer,
-- the homepage sections and one page each. `id` is the URL segment.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  id              VARCHAR(64)  NOT NULL,
  title           VARCHAR(120) NOT NULL,
  -- Shown in nav and filter chips where the full title is too long.
  nav_label       VARCHAR(60)      NULL,
  description     TEXT         NOT NULL,
  -- What the client ends up with, in their words. Sits under the page title.
  outcome         TEXT             NULL,
  intro           TEXT             NULL,
  -- Extra-element names that make a project count as evidence for this
  -- service, e.g. Stationery lists "Stationery Design Kit".
  related_extras  JSON         NOT NULL,
  -- Off removes it from nav, footer and homepage; its page stays reachable
  -- so old links never 404.
  active          TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order      INT          NOT NULL DEFAULT 99,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Projects. One row per case study.
--
-- Every narrative column is nullable on purpose: its section is simply not
-- rendered when empty. Never fill context/challenge/direction/outcome or a
-- testimonial with a guess — they are claims about a real client's business.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  slug            VARCHAR(120) NOT NULL,
  title           VARCHAR(200) NOT NULL,
  category        VARCHAR(64)  NOT NULL,
  -- How the case study lays out its images. 'deck' is pages of a document in
  -- one column; 'icons' is a grid of separate marks, each with its own name
  -- and kind. See db/migrations/002-icon-sets.sql.
  layout          ENUM('deck','icons') NOT NULL DEFAULT 'deck',
  -- Logo Design projects: powers the Type filter. Also set on guidelines
  -- projects to name the mark at the centre of the work.
  logo_type       VARCHAR(40)      NULL,
  -- Brand Guidelines projects: powers the Type filter.
  guideline_type  VARCHAR(60)      NULL,
  -- Powers the per-service Industry filter. Two projects sharing a spelling
  -- group together; a typo makes a category of one.
  industry        VARCHAR(120)     NULL,
  website         VARCHAR(255)     NULL,
  instagram       VARCHAR(255)     NULL,
  facebook        VARCHAR(255)     NULL,
  linkedin        VARCHAR(255)     NULL,
  other_links     JSON         NOT NULL,
  extras          JSON         NOT NULL,
  extras_custom   JSON         NOT NULL,
  -- Lower numbers appear earlier everywhere: homepage preview, service page,
  -- prev/next.
  sort_order      INT          NOT NULL DEFAULT 99,
  summary         TEXT         NOT NULL,
  -- The strategic idea in ~70 characters. Standfirst + meta description.
  intent          VARCHAR(255)     NULL,
  context         TEXT             NULL,
  challenge       TEXT             NULL,
  direction       TEXT             NULL,
  delivered       JSON         NOT NULL,
  -- ONLY a result the client actually reported.
  outcome         TEXT             NULL,
  -- {"quote": "...", "name": "...", "role": "..."} — only with permission.
  testimonial     JSON             NULL,
  -- Source PDF filename. The build renders its pages into project_images.
  pdf             VARCHAR(255)     NULL,
  cover           VARCHAR(255)     NULL,
  cover_alt       VARCHAR(255)     NULL,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (slug),
  KEY idx_projects_category_order (category, sort_order),
  CONSTRAINT fk_projects_service
    FOREIGN KEY (category) REFERENCES services (id)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Deck pages, in order. A row per page, not a JSON blob on the project,
-- because the case study reads them in sequence and the viewer indexes into
-- them — both want `ORDER BY sort_order`, and one page's alt text should be
-- editable without rewriting all thirty-six.
--
-- `src` is a path, never image bytes. Images stay as files served over HTTP;
-- a 62 MB deck library does not belong in a row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_images (
  project_slug    VARCHAR(120) NOT NULL,
  sort_order      INT          NOT NULL,
  src             VARCHAR(255) NOT NULL,
  alt             VARCHAR(400) NOT NULL,
  -- Set only on an icon set's images: the mark's own name and kind. A deck
  -- page is "page 7 of 45" and needs neither. Descriptive, not a filter.
  label           VARCHAR(120)     NULL,
  logo_type       VARCHAR(40)      NULL,
  PRIMARY KEY (project_slug, sort_order),
  CONSTRAINT fk_images_project
    FOREIGN KEY (project_slug) REFERENCES projects (slug)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Brand and links. Key/value rather than one wide row, so adding a setting
-- is an INSERT rather than a schema change.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_settings (
  setting_key     VARCHAR(64)  NOT NULL,
  setting_value   TEXT         NOT NULL,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
