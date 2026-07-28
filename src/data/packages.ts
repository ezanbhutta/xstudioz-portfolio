import data from './packages.json';

/**
 * Service packages shown on /packages/ — edit src/data/packages.json (or use
 * the CMS at /admin/). This module only adds types.
 */
export interface Package {
  id: string;
  name: string;
  /** One-line promise, shown under the name. */
  summary: string;
  /** Display price. Keep as text so currency/format stays flexible. */
  price: string;
  delivery: string;
  revisions: string;
  /** Ordered list of everything included. */
  includes: string[];
  /** Marks the recommended tier. Exactly one package should set this. */
  highlighted?: boolean;
  /**
   * CTA destination. IMPORTANT: set this to the package's Fiverr gig deep
   * link (e.g. https://www.fiverr.com/<user>/<gig-slug>?package=premium) so
   * buyers land on the exact scope they chose. Falls back to the studio
   * profile from src/config/site.json until gig URLs exist.
   */
  href?: string;
}

export interface ProcessStep {
  title: string;
  text: string;
}

export const PACKAGES: Package[] = data.packages;

/** The four-step process shown on /packages/. */
export const PROCESS_STEPS: ProcessStep[] = data.processSteps;
