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
    // Inline small page styles to avoid a render-blocking request.
    inlineStylesheets: 'always',
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
});
