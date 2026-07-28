import data from './categories.json';

/**
 * Work categories, in display order — edit src/data/categories.json (or use
 * the CMS at /admin/). A landing page at /<id>/ and a filter button are
 * generated for each entry; tag projects with the category `id`.
 *
 * When adding a category, also add its id to the options list in
 * public/admin/config.yml so it appears in the CMS project editor.
 */
export interface Category {
  /** URL segment + project tag. Kebab-case. */
  id: string;
  /** Category name, used everywhere: filters, captions, titles, footer. */
  title: string;
  /** One-sentence description for the category landing page + meta. */
  description: string;
}

export const CATEGORIES: Category[] = data.categories;

export type CategoryId = Category['id'];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];

export function getCategory(id: CategoryId): Category {
  const found = CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown category: ${id}`);
  return found;
}
