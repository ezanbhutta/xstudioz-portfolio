import data from './site.json';

/**
 * Central site configuration — edit src/config/site.json (or use the CMS at
 * /admin/). Every brand-level value lives there; this module only adds types.
 */
export interface SiteConfig {
  name: string;
  /** Production URL — canonicals, sitemap and robots.txt derive from it. */
  url: string;
  /** The homepage H1. The one line a first-time visitor reads. */
  headline: string;
  /** The paragraph under the headline: what the studio does, concretely. */
  lede: string;
  /** Short positioning line, used in the footer and social copy. */
  tagline: string;
  description: string;
  /** Primary conversion — all "hire us" CTAs point here. */
  fiverrUrl: string;
  /**
   * Studio LinkedIn page/profile. When set, "Connect on LinkedIn" actions
   * render site-wide (footer CTA, footer nav, project pages) so visitors
   * arriving from Behance or search can become LinkedIn connections.
   * Empty string = the LinkedIn actions simply don't render.
   */
  linkedinUrl: string;
  /** Behance profile. Empty = the link doesn't render. */
  behanceUrl: string;
  /** Instagram profile. Empty = the link doesn't render. */
  instagramUrl: string;
  /** Used in Open Graph locale + <html lang>. */
  locale: string;
}

export const SITE: SiteConfig = data;

/** Social links that are actually set, in display order. */
export const SOCIALS: { label: string; href: string }[] = [
  { label: 'LinkedIn', href: SITE.linkedinUrl },
  { label: 'Behance', href: SITE.behanceUrl },
  { label: 'Instagram', href: SITE.instagramUrl },
].filter((s) => Boolean(s.href?.trim()));
