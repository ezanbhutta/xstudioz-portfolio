import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORY_IDS } from './data/categories';

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
/** The CMS may store entry-relative image paths without the './' prefix. */
const relativize = (value: unknown) =>
  typeof value === 'string' && !value.startsWith('.') && !value.startsWith('/')
    ? `./${value}`
    : value;

const projects = defineCollection({
  loader: glob({
    pattern: '*/index.json',
    base: './src/content/projects',
    generateId: ({ entry }) => entry.replace('/index.json', ''),
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      category: z.enum(CATEGORY_IDS),
      year: z.number().int(),
      /** Lower numbers appear first within the grid. */
      order: z.number().default(99),
      /** One-sentence description shown on the project page + meta description. */
      summary: z.string(),
      /** 4:3 grid thumbnail. The detail page shows `images`, not this. */
      cover: z.preprocess(relativize, image()),
      coverAlt: z.string(),
      /** The portfolio content, in order: PDF pages, one tall sheet, or a set. */
      images: z
        .array(
          z.object({
            src: z.preprocess(relativize, image()),
            alt: z.string(),
          }),
        )
        .min(1),
    }),
});

export const collections = { projects };
