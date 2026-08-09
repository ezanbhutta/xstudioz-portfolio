/**
 * Writes for the admin.
 *
 * Reads live in `content.ts`; writes live here, because they have a different
 * job. A read tolerates a bad row — it warns and skips, so one broken project
 * cannot take the site down. A write must not create that bad row in the first
 * place, so everything here validates before it touches the database.
 *
 * Every statement binds its parameters. Nothing is interpolated into SQL,
 * including values that "obviously" came from a select box, because the admin
 * accepts an HTTP request and an HTTP request can say anything.
 */
import { query, db, type Param } from './db';
import { resolveImage } from '@/lib/content';
import { CATEGORY_IDS } from '@/data/categories';
import { LOGO_TYPES, GUIDELINE_TYPES } from '@/data/filters';

export const EXTRA_OPTIONS = [
  'Social Media Kit',
  'Stationery Design Kit',
  'Mockups',
  'Apparel Design',
  'Merchandise',
  'Marketing Materials',
] as const;

export type AdminProject = {
  slug: string;
  title: string;
  category: string;
  logo_type: string | null;
  guideline_type: string | null;
  industry: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  other_links: string;
  extras: string;
  extras_custom: string;
  sort_order: number;
  summary: string;
  intent: string | null;
  context: string | null;
  challenge: string | null;
  direction: string | null;
  delivered: string;
  outcome: string | null;
  testimonial: string | null;
  pdf: string | null;
  cover: string | null;
  cover_alt: string | null;
};

export type FieldErrors = Record<string, string>;

/** Every project, newest edit first is useless here — editors think in grid order. */
export async function listProjects() {
  const rows = await query<{
    slug: string;
    title: string;
    category: string;
    sort_order: number;
    pages: number;
    updated_at: Date;
    industry: string | null;
    cover: string | null;
    cover_width: number | null;
    cover_height: number | null;
    cover_storage: string | null;
    cover_alt: string | null;
  }>(
    `SELECT p.slug, p.title, p.category, p.sort_order, p.industry,
            p.cover, p.cover_width, p.cover_height, p.cover_storage, p.cover_alt,
            COUNT(i.src) AS pages, p.updated_at
       FROM projects p
       LEFT JOIN project_images i ON i.project_slug = p.slug
      GROUP BY p.slug, p.title, p.category, p.sort_order, p.industry,
               p.cover, p.cover_width, p.cover_height, p.cover_storage,
               p.cover_alt, p.updated_at
      ORDER BY p.sort_order ASC, p.title ASC`,
  );

  // The list shows what each project looks like, so it needs the cover as a
  // servable URL. Resolved the same way the public grid resolves it, because
  // half these rows may still be on the original file-based storage and a
  // path built by hand is a broken image for every one of them.
  return rows.map((r) => ({
    ...r,
    thumb: resolveImage(r.slug, r.cover, r.cover_storage, r.cover_width, r.cover_height),
  }));
}

export type AdminListProject = Awaited<ReturnType<typeof listProjects>>[number];

export async function getProject(slug: string): Promise<AdminProject | undefined> {
  const rows = await query<AdminProject>(`SELECT * FROM projects WHERE slug = ?`, [slug]);
  return rows[0];
}

export async function getProjectImages(slug: string) {
  return query<{ sort_order: number; src: string; alt: string }>(
    `SELECT sort_order, src, alt FROM project_images
      WHERE project_slug = ? ORDER BY sort_order ASC`,
    [slug],
  );
}

/** '' → null, so an emptied field hides its section rather than printing blank. */
const nullIfEmpty = (v: FormDataEntryValue | null): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

const str = (v: FormDataEntryValue | null): string => (typeof v === 'string' ? v.trim() : '');

/** A repeated field (checkboxes, or a textarea of one item per line). */
const list = (form: FormData, name: string): string[] => {
  const many = form.getAll(name).filter((v): v is string => typeof v === 'string');
  if (many.length > 1) return many.map((s) => s.trim()).filter(Boolean);
  const single = many[0] ?? '';
  return single
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
};

/**
 * Validate a submitted project.
 *
 * Returns errors keyed by field so the form can show each message next to the
 * input that caused it, rather than one banner that makes the editor hunt.
 */
export function validateProject(form: FormData, isNew: boolean): FieldErrors {
  const errors: FieldErrors = {};
  const slug = str(form.get('slug'));
  const title = str(form.get('title'));
  const category = str(form.get('category'));
  const summary = str(form.get('summary'));

  if (isNew) {
    if (!slug) errors.slug = 'Required — this becomes the page URL.';
    else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
      errors.slug =
        'Lowercase letters, numbers and single hyphens only, e.g. acme-brand-guidelines.';
  }
  if (!title) errors.title = 'Required.';
  if (!category) errors.category = 'Required.';
  else if (!(CATEGORY_IDS as readonly string[]).includes(category))
    errors.category = 'Not a service this site knows about.';
  if (!summary) errors.summary = 'Required — it is the case study intro and the meta description.';

  const logoType = str(form.get('logo_type'));
  if (logoType && !(LOGO_TYPES as readonly string[]).includes(logoType))
    errors.logo_type = 'Not a known logo type.';

  const guidelineType = str(form.get('guideline_type'));
  if (guidelineType && !(GUIDELINE_TYPES as readonly string[]).includes(guidelineType))
    errors.guideline_type = 'Not a known guidelines type.';

  const order = str(form.get('sort_order'));
  if (order && !/^\d+$/.test(order)) errors.sort_order = 'Whole numbers only.';

  // A testimonial with a name but no quote renders an attribution attached to
  // nothing. Either it is a quote or it is absent.
  const quote = str(form.get('testimonial_quote'));
  const who = str(form.get('testimonial_name'));
  if (!quote && who) errors.testimonial_quote = 'Add the quote, or clear the name.';

  return errors;
}

function testimonialJson(form: FormData): string | null {
  const quote = str(form.get('testimonial_quote'));
  if (!quote) return null;
  const name = str(form.get('testimonial_name'));
  const role = str(form.get('testimonial_role'));
  return JSON.stringify({ quote, ...(name && { name }), ...(role && { role }) });
}

/** Insert or update, from a validated form. */
/**
 * Where this project sits on the grid.
 *
 * The editor no longer carries a position field — dragging the list is the one
 * way to order projects, and two controls writing the same column meant they
 * could disagree. But the save is an upsert that writes every column, so the
 * value still has to come from somewhere, and the obvious `|| 99` would have
 * been a trap: saving any project from its editor would silently fling it to
 * position 99, undoing a drag the operator made a minute earlier.
 *
 * So: keep what the row already has, and give a genuinely new project the end
 * of the list rather than a shared default. `99` for everything meant every
 * new project tied with every other new project, and MySQL broke the tie by
 * whatever it felt like.
 *
 * The form value is still honoured when present, so an older form post — or a
 * future screen that wants to set it explicitly — keeps working.
 */
async function positionFor(form: FormData, slug: string): Promise<number> {
  const submitted = str(form.get('sort_order'));
  if (/^\d+$/.test(submitted)) return Number(submitted);

  const [existing] = await query<{ sort_order: number }>(
    `SELECT sort_order FROM projects WHERE slug = ?`,
    [slug],
  );
  if (existing) return existing.sort_order;

  const [last] = await query<{ next: number | null }>(
    `SELECT MAX(sort_order) + 1 AS next FROM projects`,
  );
  return last?.next ?? 1;
}

export async function saveProject(form: FormData, slug: string): Promise<void> {
  const values: Param[] = [
    slug,
    str(form.get('title')),
    str(form.get('category')),
    nullIfEmpty(form.get('logo_type')),
    nullIfEmpty(form.get('guideline_type')),
    nullIfEmpty(form.get('industry')),
    nullIfEmpty(form.get('website')),
    nullIfEmpty(form.get('instagram')),
    nullIfEmpty(form.get('facebook')),
    nullIfEmpty(form.get('linkedin')),
    JSON.stringify(list(form, 'other_links')),
    JSON.stringify(form.getAll('extras').filter((v): v is string => typeof v === 'string')),
    JSON.stringify(list(form, 'extras_custom')),
    await positionFor(form, slug),
    str(form.get('summary')),
    nullIfEmpty(form.get('intent')),
    nullIfEmpty(form.get('context')),
    nullIfEmpty(form.get('challenge')),
    nullIfEmpty(form.get('direction')),
    JSON.stringify(list(form, 'delivered')),
    nullIfEmpty(form.get('outcome')),
    testimonialJson(form),
    nullIfEmpty(form.get('cover_alt')),
  ];

  await db().execute(
    `INSERT INTO projects
       (slug, title, category, logo_type, guideline_type, industry, website,
        instagram, facebook, linkedin, other_links, extras, extras_custom,
        sort_order, summary, intent, context, challenge, direction, delivered,
        outcome, testimonial, cover_alt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       title=VALUES(title), category=VALUES(category), logo_type=VALUES(logo_type),
       guideline_type=VALUES(guideline_type), industry=VALUES(industry),
       website=VALUES(website), instagram=VALUES(instagram),
       facebook=VALUES(facebook), linkedin=VALUES(linkedin),
       other_links=VALUES(other_links), extras=VALUES(extras),
       extras_custom=VALUES(extras_custom), sort_order=VALUES(sort_order),
       summary=VALUES(summary), intent=VALUES(intent), context=VALUES(context),
       challenge=VALUES(challenge), direction=VALUES(direction),
       delivered=VALUES(delivered), outcome=VALUES(outcome),
       testimonial=VALUES(testimonial), cover_alt=VALUES(cover_alt)`,
    values,
  );
}

/**
 * Delete a project.
 *
 * `project_images` cascades. The image FILES are deliberately left on disk:
 * a mis-click in an admin with no undo should not destroy the only copy of a
 * rendered deck, and an orphaned folder costs nothing but space.
 */
export async function deleteProject(slug: string): Promise<void> {
  await db().execute(`DELETE FROM projects WHERE slug = ?`, [slug]);
}

/** Re-order a project without opening it. */
export async function setOrder(slug: string, order: number): Promise<void> {
  await db().execute(`UPDATE projects SET sort_order = ? WHERE slug = ?`, [order, slug]);
}

export async function listSettings() {
  return query<{ setting_key: string; setting_value: string }>(
    `SELECT setting_key, setting_value FROM site_settings ORDER BY setting_key`,
  );
}

/**
 * Save settings.
 *
 * Only keys that already exist are written. The form cannot invent a setting,
 * so a stray input name is ignored rather than quietly adding a row nothing
 * reads.
 */
export async function saveSettings(form: FormData): Promise<void> {
  const known = new Set((await listSettings()).map((r) => r.setting_key));
  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();
    for (const [key, value] of form.entries()) {
      if (!known.has(key) || typeof value !== 'string') continue;
      await conn.execute(`UPDATE site_settings SET setting_value = ? WHERE setting_key = ?`, [
        value.trim(),
        key,
      ]);
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
