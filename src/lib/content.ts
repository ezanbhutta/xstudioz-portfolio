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

/** Resolve a stored path (`./page-01.png`) against its project folder. */
function resolveImage(slug: string, src: string | null | undefined): ImageMetadata | undefined {
  if (!src) return undefined;
  const file = src.replace(/^\.\//, '').replace(/^\//, '');
  return IMAGES[`/src/content/projects/${slug}/${file}`]?.default;
}

export type ProjectImage = { src: ImageMetadata; alt: string };

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
  cover?: ImageMetadata;
  coverAlt?: string;
  images: ProjectImage[];
};

export type Project = { id: string; data: ProjectData };
export type ReadyProject = Project & {
  data: ProjectData & { cover: ImageMetadata; images: ProjectImage[] };
};

type ProjectRow = Record<string, unknown>;
type ImageRow = { project_slug: string; src: string; alt: string };

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
  const [rows, imageRows] = await Promise.all([
    query<ProjectRow>(`SELECT * FROM projects ORDER BY sort_order ASC, title ASC`),
    query<ImageRow>(
      `SELECT project_slug, src, alt FROM project_images ORDER BY project_slug, sort_order ASC`,
    ),
  ]);

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

    const cover = resolveImage(slug, opt(row.cover));
    const images = (bySlug.get(slug) ?? [])
      .map((img) => ({ src: resolveImage(slug, img.src), alt: img.alt }))
      .filter((img): img is ProjectImage => Boolean(img.src));

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
