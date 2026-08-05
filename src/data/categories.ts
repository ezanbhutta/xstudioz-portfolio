import data from './categories.json';

/**
 * Services, in display order — edit src/data/categories.json (or use the CMS
 * at /admin/ → Site settings → Services).
 *
 * One entry does three jobs:
 *   1. the project taxonomy (`id` is what a project is tagged with),
 *   2. the service landing page at /<id>/,
 *   3. the service's row in the nav and the footer.
 *
 * A service page never depends on having published work: it states the
 * promise, makes the argument, and shows work only when work exists.
 * `relatedExtras` lets a service claim projects that *included* it as an
 * add-on — a guidelines project with a "Stationery Design Kit" in its extras
 * is real evidence for the Stationery page.
 *
 * When adding a service, also add its id to the Projects category options in
 * public/admin/config.yml so it appears in the CMS project editor.
 */
export interface Category {
  /** URL segment + project tag. Kebab-case. */
  id: string;
  /** Full service name, used in headings, captions and metadata. */
  title: string;
  /** Shorter label for tight places (nav, filter chips). Falls back to title. */
  navLabel?: string;
  /** One-sentence summary, used for meta descriptions and cards. */
  description: string;
  /** The promise, in the client's terms. Sits under the service page title. */
  outcome?: string;
  /** A short paragraph on why this service exists and what it solves. */
  intro?: string;
  /**
   * Extra-element labels (see src/data/filters.ts) that count as evidence of
   * this service. Used to surface honest related work for services that have
   * no standalone case study yet.
   */
  relatedExtras?: string[];
  /**
   * Offered right now. Inactive services drop out of navigation, the services
   * hub, the footer and the work filters — set false rather than deleting, so
   * the copy survives for when the service comes back.
   */
  active?: boolean;
}

export const CATEGORIES: Category[] = data.categories;

/** Services currently on offer — everything client-facing iterates this. */
export const ACTIVE_CATEGORIES: Category[] = CATEGORIES.filter((c) => c.active !== false);

export type CategoryId = Category['id'];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];

export function getCategory(id: CategoryId): Category {
  const found = CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown category: ${id}`);
  return found;
}

/** Short label for chips and navigation; falls back to the full title. */
export function categoryLabel(id: CategoryId): string {
  const c = CATEGORIES.find((x) => x.id === id);
  return c?.navLabel ?? c?.title ?? id;
}
