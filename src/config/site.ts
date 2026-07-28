/**
 * Central site configuration.
 * Every brand-level value lives here — change once, applies everywhere.
 */
export const SITE = {
  name: 'XStudioz',
  /** Production URL. Update when the final domain is connected. */
  url: 'https://xstudioz.design',
  tagline: 'Identity, crafted with intent.',
  description:
    'XStudioz is an independent design studio crafting logos, brand identities, guidelines, stationery, social media design and animation for ambitious businesses.',
  /** Primary conversion — all "hire us" CTAs point here. */
  fiverrUrl: 'https://www.fiverr.com/xstudioz',
  /** Used in Open Graph locale + <html lang>. */
  locale: 'en',
} as const;
