import data from './studio.json';

/**
 * Studio content that isn't a project or a service — edit
 * src/data/studio.json (or the CMS at /admin/ → Site settings → Studio
 * content).
 *
 * The honesty rule this file exists to enforce: `proof.testimonials`,
 * `proof.clients` and `proof.stats` are empty until real ones exist. Every
 * component that renders them checks first, and the trust section falls back
 * to `expectations` — what a client can expect — rather than inventing social
 * proof. Add a testimonial only with the client's words and permission.
 */
export interface Testimonial {
  /** The client's own words. Never paraphrase into a stronger claim. */
  quote: string;
  /** Who said it. A first name and a role is enough. */
  name: string;
  /** Their role and/or company, e.g. "Founder, Rad Soft". */
  role?: string;
  /** Which project it came from, if it maps to one (a project slug). */
  project?: string;
}

export interface Stat {
  /** The number itself, e.g. "8" or "5★". Must be verifiable. */
  value: string;
  /** What it counts, e.g. "Brands delivered". */
  label: string;
  /** Optional footnote, e.g. "Fiverr, as of 2026". */
  note?: string;
}

export interface ExpectationItem {
  title: string;
  text: string;
}

export interface ProcessStep {
  name: string;
  summary: string;
  /** What the client is responsible for at this stage. */
  client: string[];
  /** What XStudioz hands over at this stage. */
  studio: string[];
}

export interface BriefItem {
  label: string;
  hint: string;
}

export interface StudioContent {
  proof: {
    testimonials: Testimonial[];
    clients: string[];
    stats: Stat[];
  };
  expectations: {
    overline: string;
    title: string;
    lede: string;
    items: ExpectationItem[];
  };
  process: {
    overline: string;
    title: string;
    lede: string;
    steps: ProcessStep[];
    /** e.g. "Two revision rounds included." Empty = the line is not rendered. */
    revisionsNote: string;
    /** e.g. "Most logo projects run 3–5 days." Empty = not rendered. */
    timelineNote: string;
  };
  brief: {
    overline: string;
    title: string;
    lede: string;
    items: BriefItem[];
    reassurance: string[];
    ctaLabel: string;
    ctaNote: string;
  };
}

export const STUDIO: StudioContent = data as unknown as StudioContent;

/** True once there is at least one real testimonial to show. */
export const hasTestimonials = STUDIO.proof.testimonials.length > 0;
