/**
 * Logo Design sub-filters.
 *
 * LOGO_TYPES is the fixed taxonomy shown in the "Type" dropdown. Industries
 * are NOT listed here: the "Industry" dropdown builds itself from whatever
 * `industry` values exist on logo-design projects, so new industries appear
 * automatically as projects are added.
 *
 * When editing LOGO_TYPES, mirror the options list in
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
