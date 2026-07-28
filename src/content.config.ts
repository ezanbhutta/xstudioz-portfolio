import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORY_IDS } from './data/categories';

/**
 * One folder per project under src/content/projects/<slug>/:
 *   index.json  — metadata (this schema)
 *   *.png|jpg…  — images referenced relatively from index.json
 *
 * Adding a project = add a folder. Removing one = delete the folder.
 * Images can be swapped in place without touching any layout code.
 */
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
      cover: image(),
      coverAlt: z.string(),
      images: z.array(
        z.object({
          src: image(),
          alt: z.string(),
        }),
      ),
    }),
});

export const collections = { projects };
