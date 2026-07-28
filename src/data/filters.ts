import type { CategoryId } from '@/data/categories';

/**
 * Per-category sub-filters.
 *
 * The fixed "Type" taxonomies live here; the "Industry" dropdown builds
 * itself from whatever `industry` values exist on each category's projects,
 * so new industries appear automatically as projects are added.
 *
 * When editing a taxonomy, mirror its options list in
 * public/admin/config.yml so the CMS dropdown matches.
 */
export const LOGO_TYPES = [
  'Wordmark',
  'Abstract',
  'Pictorial',
  'Combination',
  'Mascot',
  'Emblem',
  'Lettermark',
] as const;

export type LogoType = (typeof LOGO_TYPES)[number];

export const GUIDELINE_TYPES = [
  'Short Brand Guidelines',
  'Full Brand Guidelines',
  'Premium Brand Guidelines',
] as const;

export type GuidelineType = (typeof GUIDELINE_TYPES)[number];

/**
 * Extra elements a guidelines project can include (Social Media Kit,
 * Mockups…). Deliberately NOT a filter: they are listed on the project
 * page under the project's type. The CMS offers these presets plus a
 * free-text list for anything custom.
 */
export const EXTRA_ELEMENTS = [
  'Social Media Kit',
  'Stationery Design Kit',
  'Mockups',
  'Apparel Design',
  'Merchandise',
  'Marketing Materials',
] as const;

interface TypeFilter {
  /** The project-data field (and card data attribute) the dropdown matches. */
  key: 'logoType' | 'guidelineType';
  options: readonly string[];
}

/** Categories with a fixed "Type" dropdown; every category gets Industry. */
export const TYPE_FILTERS: Partial<Record<CategoryId, TypeFilter>> = {
  'logo-design': { key: 'logoType', options: LOGO_TYPES },
  'brand-guidelines': { key: 'guidelineType', options: GUIDELINE_TYPES },
};
