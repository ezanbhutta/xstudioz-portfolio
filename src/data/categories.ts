/**
 * Work categories, in display order.
 *
 * To add a category: add an entry here, then tag projects with its `id`.
 * A landing page at /<id>/ and a filter button are generated automatically.
 */
export interface Category {
  /** URL segment + project tag. Kebab-case. */
  id: string;
  /** Short label used in filters and cards. */
  label: string;
  /** Full name used in page titles. */
  title: string;
  /** One-sentence description for the category landing page + meta. */
  description: string;
}

export const CATEGORIES = [
  {
    id: 'logo-design',
    label: 'Logos',
    title: 'Logo Design',
    description:
      'Distinctive marks and logotypes — built on geometry, reduced to essentials, made to last.',
  },
  {
    id: 'brand-identity',
    label: 'Brand Identity',
    title: 'Brand Identity',
    description:
      'Complete visual identities — logo, color, type and voice working as one coherent system.',
  },
  {
    id: 'brand-guidelines',
    label: 'Guidelines',
    title: 'Brand Guidelines',
    description:
      'Clear, practical brand books that keep every future touchpoint consistent and on-brand.',
  },
  {
    id: 'stationery',
    label: 'Stationery',
    title: 'Stationery Design',
    description:
      'Business cards, letterheads and print collateral that carry the brand into the physical world.',
  },
  {
    id: 'social-media',
    label: 'Social Media',
    title: 'Social Media Design',
    description:
      'Feed systems, templates and campaign visuals designed to stay recognisable at scroll speed.',
  },
  {
    id: 'animation',
    label: 'Animation',
    title: 'Animation',
    description:
      'Logo reveals and motion identities that give brands life beyond the static frame.',
  },
] as const satisfies readonly Category[];

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [
  CategoryId,
  ...CategoryId[],
];

export function getCategory(id: CategoryId): Category {
  const found = CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown category: ${id}`);
  return found;
}
