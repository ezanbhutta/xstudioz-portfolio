/**
 * Work categories, in display order.
 *
 * To add a category: add an entry here, then tag projects with its `id`.
 * A landing page at /<id>/ and a filter button are generated automatically.
 */
export interface Category {
  /** URL segment + project tag. Kebab-case. */
  id: string;
  /** Category name, used everywhere: filters, captions, titles, footer. */
  title: string;
  /** One-sentence description for the category landing page + meta. */
  description: string;
}

export const CATEGORIES = [
  {
    id: 'logo-design',
    title: 'Logo Design',
    description:
      'Primary marks, lockups and monograms — delivered in SVG, PDF and PNG with color and mono versions.',
  },
  {
    id: 'brand-identity',
    title: 'Brand Identity',
    description:
      'Logo suite, color palette, typography and applications — one coherent system with every file you need.',
  },
  {
    id: 'brand-guidelines',
    title: 'Brand Guidelines',
    description:
      'Practical brand books covering logo rules, color, type and usage — so every future design stays on-brand.',
  },
  {
    id: 'stationery',
    title: 'Stationery Design',
    description:
      'Business cards, letterheads and envelopes — print-ready files with bleed, set up for any print shop.',
  },
  {
    id: 'social-media',
    title: 'Social Media Design',
    description:
      'Feed templates, story layouts and campaign tiles — sized for every platform, editable for every post.',
  },
  {
    id: 'animation',
    title: 'Animation',
    description:
      'Logo reveals and motion identities — delivered as MP4 and GIF, ready for web, decks and social.',
  },
] as const satisfies readonly Category[];

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];

export function getCategory(id: CategoryId): Category {
  const found = CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown category: ${id}`);
  return found;
}
