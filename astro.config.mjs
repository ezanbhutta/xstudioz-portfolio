// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';
import { SITE } from './src/config/site';

export default defineConfig({
  site: SITE.url,
  trailingSlash: 'always',
  // Server-rendered so a content edit is live on the next request rather than
  // the next build. Hostinger runs the Node process on the same machine as
  // MySQL, so the database is reached over localhost and port 3306 never
  // opens to the internet.
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [sitemap()],
  image: {
    // Portfolio images are the product — allow generous responsive widths.
    responsiveStyles: true,
  },
  build: {
    // Small page styles inline; the shared bundle externalizes into one
    // hashed, immutable-cacheable file (see public/.htaccess headers).
    inlineStylesheets: 'auto',
  },
  prefetch: {
    // Opt-in per link (hover/tap dwell) — viewport prefetching all 21
    // same-origin documents from home wasted ~125 KB per visit.
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
});
