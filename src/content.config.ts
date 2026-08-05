import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORY_IDS } from './data/categories';
import { GUIDELINE_TYPES, LOGO_TYPES } from './data/filters';

/**
 * One folder per project under src/content/projects/<slug>/:
 *   index.json  — metadata (this schema)
 *   *.png|jpg…  — images referenced relatively from index.json
 *
 * Real portfolios arrive as ONE asset per brand — either a tall
 * presentation image (`sheet.png`) or a `portfolio.pdf`. Drop it in the
 * folder and run `npm run ingest` (see scripts/ingest.mjs): page images,
 * the 4:3 grid cover and the download link are generated automatically.
 *
 * Adding a project = add a folder. Removing one = delete the folder.
 */
/** The CMS stores "empty" as '' or [] — normalize those to undefined. */
const emptyToUndef = (value: unknown) =>
  value === '' || (Array.isArray(value) && value.length === 0) ? undefined : value;

/** Empty → undefined; a bare domain gets https:// so links always work. */
const urlize = (value: unknown) => {
  if (value === '' || value == null) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

/** The CMS may store entry-relative image paths without the './' prefix. */
const relativize = (value: unknown) => {
  if (value === '' || value == null) return undefined;
  return typeof value === 'string' && !value.startsWith('.') && !value.startsWith('/')
    ? `./${value}`
    : value;
};

const projects = defineCollection({
  loader: glob({
    pattern: '*/index.json',
    base: './src/content/projects',
    generateId: ({ entry }) => entry.replace('/index.json', ''),
  }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        category: z.enum(CATEGORY_IDS),
        /** Logo Design projects only: powers the Type dropdown filter. */
        logoType: z.preprocess(emptyToUndef, z.enum(LOGO_TYPES).optional()),
        /** Brand Guidelines projects only: powers the Type dropdown filter. */
        guidelineType: z.preprocess(emptyToUndef, z.enum(GUIDELINE_TYPES).optional()),
        /** Powers the per-category Industry dropdown filter. */
        industry: z.preprocess(emptyToUndef, z.string().optional()),
        /**
         * Free-text escape hatch for an industry not yet in the CMS dropdown;
         * merged into `industry` below. The dropdown wins when both are set,
         * so a leftover typed value never overrides a later deliberate pick.
         */
        industryNew: z.preprocess(emptyToUndef, z.string().optional()),
        /**
         * Brand links, every one optional — the project page only renders
         * the ones that are set. Socials accept a full link or a bare
         * username; otherLinks covers any platform not named here.
         */
        website: z.preprocess(urlize, z.string().optional()),
        instagram: z.preprocess(emptyToUndef, z.string().optional()),
        facebook: z.preprocess(emptyToUndef, z.string().optional()),
        linkedin: z.preprocess(emptyToUndef, z.string().optional()),
        otherLinks: z.preprocess(emptyToUndef, z.array(z.string()).optional()),
        /**
         * Extra elements included beyond the core sections (Social Media Kit,
         * Mockups…). Listed on the project page — not filterable.
         */
        extras: z.preprocess(emptyToUndef, z.array(z.string()).optional()),
        /** Free-text extras for anything the preset list doesn't cover. */
        extrasCustom: z.preprocess(emptyToUndef, z.array(z.string()).optional()),
        /** Kept optional for older entries; no longer shown anywhere. */
        year: z.number().int().optional(),
        /** Lower numbers appear first within the grid. */
        order: z.number().default(99),
        /** One-sentence description shown on the project page + meta description. */
        summary: z.string(),
        /**
         * The strategic idea in one short line (≤ ~70 chars) — the caption
         * under a grid card and the standfirst on the case study. Distinct
         * from `summary`, which is the full paragraph.
         */
        intent: z.preprocess(emptyToUndef, z.string().optional()),
        /**
         * Case-study narrative. Every field is optional and its section is
         * simply not rendered when empty — a project with only a summary
         * still produces a clean page. Never fill these with guesses; they
         * are claims about a real client's business.
         */
        context: z.preprocess(emptyToUndef, z.string().optional()),
        challenge: z.preprocess(emptyToUndef, z.string().optional()),
        direction: z.preprocess(emptyToUndef, z.string().optional()),
        /** What was actually handed over on this project. */
        delivered: z.preprocess(emptyToUndef, z.array(z.string()).optional()),
        /**
         * A real, verifiable result. Leave empty unless the client reported
         * it — the section does not render without one.
         */
        outcome: z.preprocess(emptyToUndef, z.string().optional()),
        /** The client's own words, with permission. Omit rather than invent. */
        testimonial: z.preprocess(
          emptyToUndef,
          z
            .object({
              quote: z.string(),
              name: z.string(),
              role: z.string().optional(),
            })
            .optional(),
        ),
        /**
         * CMS PDF upload (any filename). The build renders its pages and
         * generates cover + images automatically — leave those empty.
         */
        pdf: z.preprocess(emptyToUndef, z.string().optional()),
        /** Grid preview. Generated by ingest: guidelines decks get a full 16:9 frame, everything else keeps its own proportions. */
        cover: z.preprocess(relativize, image().optional()),
        coverAlt: z.preprocess(emptyToUndef, z.string().optional()),
        /** The portfolio content, in order: PDF pages, one tall sheet, or a set. */
        images: z.preprocess(
          emptyToUndef,
          z
            .array(
              z.object({
                src: z.preprocess(relativize, image()),
                alt: z.string(),
              }),
            )
            .min(1)
            .optional(),
        ),
      })
      .transform(({ industryNew, ...data }) => ({
        ...data,
        industry: (data.industry ?? industryNew)?.trim(),
      })),
});

export const collections = { projects };
