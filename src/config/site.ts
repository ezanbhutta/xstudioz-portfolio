import data from './site.json';

/**
 * Central site configuration — edit src/config/site.json (or use the CMS at
 * /admin/). Every brand-level value lives there; this module only adds types.
 */
export interface SiteConfig {
  name: string;
  /** Production URL — canonicals, sitemap and robots.txt derive from it. */
  url: string;
  tagline: string;
  description: string;
  /** Primary conversion — all "hire us" CTAs point here. */
  fiverrUrl: string;
  /** Used in Open Graph locale + <html lang>. */
  locale: string;
}

export const SITE: SiteConfig = data;
