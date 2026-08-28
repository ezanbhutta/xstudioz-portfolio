/**
 * The portfolio, read from MySQL.
 *
 * This replaces the content-collection read in `getSortedProjects`, and
 * returns the same `{ id, data }` shape the pages already consume — so the
 * components, filters, sorting and case study template are untouched. The
 * database became the source of truth; nothing downstream had to know.
 *
 * Text is read per request, which is the entire point: an edit in the admin
 * writes a row and the next page load shows it. There is no build in between.
 *
 * Images are the exception, and deliberately so. `<Picture>` and `getImage()`
 * need Astro's `ImageMetadata` — real width, height and format — to emit
 * responsive WebP. A path string from a database cannot supply that. So the
 * database stores paths and the glob below resolves each one to the asset
 * Astro processed, keeping every image optimized rather than shipping 62 MB
 * of raw PNG to visitors.
 */
import type { ImageMetadata } from 'astro';
import { query, jsonList, jsonObject, opt } from './db';
import { srcsetFor, WIDTHS, LEGACY_WIDTHS } from './uploads';
import { CATEGORY_IDS, type CategoryId } from '@/data/categories';

/**
 * Every project image, keyed by repo-absolute path.
 *
 * Eager because a lazy glob returns importers, and resolving hundreds of
 * promises per request to render one grid would cost more than the query. The
 * map is built once when the module loads.
 */
const IMAGES = import.meta.glob<{ default: ImageMetadata }>(
  '/src/content/projects/**/*.{png,jpg,jpeg,webp,avif}',
  { eager: true },
);

/**
 * One image, however it is stored.
 *
 * Both kinds resolve to the same four fields, so nothing that renders an image
 * has to know whether it came from the build or from an upload. `width` and
 * `height` are always present because the page uses them to reserve space —
 * without them a thirty-six page deck reflows thirty-six times as it loads.
 */
export type ResolvedImage = {
  src: string;
  srcset?: string;
  /**
   * The same ladder in AVIF, present only when those files were actually
   * written. Offered as a <picture> source ahead of the WebP: a browser does
   * not fall back from a <source> that 404s, so this is undefined rather than
   * optimistic whenever the encode did not happen.
   */
  avifSrcset?: string;
  width: number;
  height: number;
};

export type ProjectImage = ResolvedImage & {
  alt: string;
  /**
   * An icon's own name and kind, set only on a project whose layout is
   * 'icons'. A deck page is "page 7 of 45" and needs neither, so both are
   * undefined for every deck — which is what the gallery keys off to decide
   * whether it has captions to render.
   */
  label?: string;
  logoType?: string;
};

/**
 * Resolve a stored path.
 *
 * `upload` — written by the admin into the uploads directory and served as a
 * plain file, with its dimensions recorded at the time it was written.
 *
 * `asset` — the original arrangement, resolved through the build glob. Kept as
 * a fallback so a row the migration could not convert still renders instead of
 * vanishing; `scripts/migrate-images.mjs` moves them across.
 */
export function resolveImage(
  slug: string,
  src: string | null | undefined,
  storage: unknown,
  width: unknown,
  height: unknown,
  /**
   * What the row says was written, e.g. 'avif,webp'. Absent — an old row, or a
   * database that has not run the formats migration yet — means WebP only,
   * which is what every image was before AVIF existed.
   */
  formats?: unknown,
): ResolvedImage | undefined {
  if (!src) return undefined;

  if (storage === 'upload') {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    // A row with no dimensions would render an image the layout cannot
    // reserve space for. Treat it as unresolved so the warning names it.
    if (w === 0 || h === 0) return undefined;
    // 'avif' is written only by the paths that also write the 1280 rung, so
    // it is the exact record of which ladder is on disk for this image. An
    // image that predates both gets the ladder it actually has; offering it
    // the wider one would advertise a width that 404s.
    const hasAvif = String(formats ?? '')
      .split(',')
      .includes('avif');
    const ladder = hasAvif ? WIDTHS : LEGACY_WIDTHS;
    return {
      src,
      srcset: srcsetFor(src, w, 'webp', ladder),
      ...(hasAvif ? { avifSrcset: srcsetFor(src, w, 'avif', ladder) } : {}),
      width: w,
      height: h,
    };
  }

  const file = src.replace(/^\.\//, '').replace(/^\//, '');
  const meta = IMAGES[`/src/content/projects/${slug}/${file}`]?.default;
  if (!meta) return undefined;
  return { src: meta.src, width: meta.width, height: meta.height };
}

export type ProjectData = {
  title: string;
  category: CategoryId;
  logoType?: string;
  guidelineType?: string;
  industry?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  otherLinks: string[];
  extras: string[];
  extrasCustom: string[];
  order: number;
  summary: string;
  intent?: string;
  context?: string;
  challenge?: string;
  direction?: string;
  delivered: string[];
  outcome?: string;
  testimonial?: { quote: string; name?: string; role?: string };
  pdf?: string;
  /** 'deck' reads the images as pages of a document; 'icons' as a set. */
  layout: 'deck' | 'icons';
  cover?: ResolvedImage;
  coverAlt?: string;
  images: ProjectImage[];
};

/**
 * The last database failure, for /health to report.
 *
 * The alternative is asking someone to find a stack trace in a hosting panel
 * that may not surface one at all — which is exactly the position this project
 * spent four deployments in.
 */
let lastDatabaseError: string | null = null;
export const databaseError = () => lastDatabaseError;

export type Project = { id: string; data: ProjectData };
export type ReadyProject = Project & {
  data: ProjectData & { cover: ResolvedImage; images: ProjectImage[] };
};

type ProjectRow = Record<string, unknown>;
type ImageRow = {
  project_slug: string;
  src: string;
  alt: string;
  storage: string;
  width: number | null;
  height: number | null;
  label: string | null;
  logo_type: string | null;
  /** Absent until the formats migration has run. Read defensively. */
  formats?: string | null;
};

/** A bare domain gets https:// so a link the studio typed by hand still works. */
const urlize = (value: unknown): string | undefined => {
  const v = opt(value);
  if (!v) return undefined;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};

/**
 * All displayable projects in order (curated `sort_order`, then A–Z).
 *
 * Two queries, not one per project: a join would repeat every project's text
 * across all thirty-six of its page rows, and a query per project would turn
 * one page render into nine round trips. Both are read once and stitched in
 * memory.
 */
export async function getSortedProjects(): Promise<ReadyProject[]> {
  let rows: ProjectRow[];
  let imageRows: ImageRow[];

  try {
    [rows, imageRows] = await Promise.all([
      query<ProjectRow>(`SELECT * FROM projects ORDER BY sort_order ASC, title ASC`),
      // `SELECT *` rather than a column list, so that a database which has
      // not run the formats migration still answers. A named column that does
      // not exist is a query error and an empty portfolio; a missing key is
      // just an image with no AVIF, which is how the whole site worked
      // yesterday.
      query<ImageRow>(`SELECT * FROM project_images ORDER BY project_slug, sort_order ASC`),
    ]);
  } catch (error) {
    // An unreachable database used to take every page down with it, which on a
    // platform that health-checks the site reads as a failed deployment and
    // hides the actual error. Rendering an empty portfolio is wrong, but it is
    // visibly wrong and it keeps the process up — including /health, which
    // says what went wrong in plain words.
    lastDatabaseError = error instanceof Error ? error.message : String(error);
    console.error('[content] Database unreachable — serving an empty portfolio:', error);
    return [];
  }
  lastDatabaseError = null;

  const bySlug = new Map<string, ImageRow[]>();
  for (const row of imageRows) {
    const list = bySlug.get(row.project_slug);
    if (list) list.push(row);
    else bySlug.set(row.project_slug, [row]);
  }

  const ready: ReadyProject[] = [];

  for (const row of rows) {
    const slug = String(row.slug);
    const category = String(row.category);

    // A category the site does not know about would crash the filters and
    // the service pages. Skip it and say so rather than take the site down
    // over one bad row.
    if (!(CATEGORY_IDS as readonly string[]).includes(category)) {
      console.warn(`[content] "${slug}" skipped: unknown category "${category}".`);
      continue;
    }

    const images = (bySlug.get(slug) ?? [])
      .map((img) => ({
        ...resolveImage(slug, img.src, img.storage, img.width, img.height, img.formats),
        alt: img.alt,
        ...(img.label ? { label: img.label } : {}),
        ...(img.logo_type ? { logoType: img.logo_type } : {}),
      }))
      .filter((img): img is ProjectImage => Boolean(img.src));

    /**
     * The cover, with the old standalone `cover.webp` left behind.
     *
     * That file was a copy of page one, reframed for a grid tile that had a
     * fixed 16:9 shape. Neither the reframing nor the fixed shape exists any
     * more — a card takes its ratio from the cover, and the cover is simply a
     * page — but a copy already written stays exactly as it was written. One
     * generated while the framing cropped to 16:9 is still cropped, still
     * 1600×900 beside its own untouched 1600×1077 page, and no amount of
     * fixing the generator reaches it. Only re-running the operation does,
     * which means the site stays visibly wrong until an operator happens to.
     *
     * So it is resolved past instead. A cover pointing at `/uploads/<slug>/
     * cover.webp` can only be one of these: every cover set since points at a
     * page's own file, so there is no ambiguity about what this pattern means.
     * Page one is what such a cover was made from unless someone had chosen
     * otherwise, and the old scheme wrote every choice to the same filename,
     * so page one is also the only answer still recoverable.
     *
     * Read-time, not a migration: this has to be right on the next request,
     * not on the next time someone remembers to run something. The row is left
     * alone — an upload rewrites it correctly, and the stale file is deleted
     * the next time its deck is replaced.
     */
    const legacyCover = /^\/uploads\/[^/]+\/cover\.webp$/.test(String(row.cover ?? ''));
    /**
     * The cover's formats are the formats of the page it points at.
     *
     * Looked up rather than stored a second time on `projects`. A cover is a
     * reference to a page now, so a `cover_formats` column would be a copy of
     * a fact that already exists — and copies go stale, which is exactly how
     * the old standalone cover.webp went wrong.
     */
    const coverFormats = (bySlug.get(slug) ?? []).find((i) => i.src === row.cover)?.formats;
    const cover =
      legacyCover && images[0]
        ? images[0]
        : resolveImage(
            slug,
            opt(row.cover),
            row.cover_storage,
            row.cover_width,
            row.cover_height,
            coverFormats,
          );

    // Same rule the content-collection version applied: a project without
    // visuals is not displayable, and a warning beats a broken grid.
    if (!cover || images.length === 0) {
      console.warn(
        `[content] "${slug}" skipped: no visuals resolved. The row's image ` +
          `paths must match files under src/content/projects/${slug}/.`,
      );
      continue;
    }

    ready.push({
      id: slug,
      data: {
        title: String(row.title),
        category: category as CategoryId,
        logoType: opt(row.logo_type),
        guidelineType: opt(row.guideline_type),
        industry: opt(row.industry),
        website: urlize(row.website),
        instagram: urlize(row.instagram),
        facebook: urlize(row.facebook),
        linkedin: urlize(row.linkedin),
        otherLinks: jsonList(row.other_links),
        extras: jsonList(row.extras),
        extrasCustom: jsonList(row.extras_custom),
        order: Number(row.sort_order) || 99,
        summary: String(row.summary ?? ''),
        intent: opt(row.intent),
        context: opt(row.context),
        challenge: opt(row.challenge),
        direction: opt(row.direction),
        delivered: jsonList(row.delivered),
        outcome: opt(row.outcome),
        testimonial: jsonObject<{ quote: string; name?: string; role?: string }>(row.testimonial),
        pdf: opt(row.pdf),
        // Anything but the exact string 'icons' reads as a deck, so a row
        // predating this column — or one holding something unexpected — keeps
        // the behaviour every project had before icon sets existed.
        layout: row.layout === 'icons' ? 'icons' : 'deck',
        cover,
        coverAlt: opt(row.cover_alt),
        images,
      },
    });
  }

  return ready;
}

/** Brand and links, as a plain object keyed the way `site.json` was. */
export async function getSiteSettings(): Promise<Record<string, string>> {
  const rows = await query<{ setting_key: string; setting_value: string }>(
    `SELECT setting_key, setting_value FROM site_settings`,
  );
  return Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
}
