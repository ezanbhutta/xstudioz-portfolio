// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE } from './src/config/site';

export default defineConfig({
  site: SITE.url,
  trailingSlash: 'always',
  integrations: [sitemap()],
  image: {
    // Portfolio images are the product — allow generous responsive widths.
    responsiveStyles: true,
  },
  build: {
    // Small page styles inline; the shared bundle externalizes into one
    // hashed, immutable-cacheable file (see public/_headers).
    inlineStylesheets: 'auto',
  },
  prefetch: {
    // Opt-in per link (hover/tap dwell) — viewport prefetching all 21
    // same-origin documents from home wasted ~125 KB per visit.
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
});
