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
  security: {
    // Astro's own check compares the Origin header against `site`, which is
    // the production URL. That makes every POST fail anywhere else — on
    // localhost, on a staging domain, behind a preview URL — so the admin
    // could only ever be exercised in production. src/middleware.ts runs the
    // equivalent check against the request's real host instead, which blocks
    // the same cross-site form posts and can actually be tested.
    checkOrigin: false,
  },
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
