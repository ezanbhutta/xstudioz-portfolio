/**
 * The sitemap index robots.txt points at.
 *
 * One child, which is all fourteen public URLs — well inside the 50,000 a
 * single sitemap may hold. It exists because this is the URL already in
 * robots.txt and already submitted to Search Console, and @astrojs/sitemap
 * published this same index-plus-one-child shape. Keeping both URLs answering
 * means nothing that already knows about this site has to be told again.
 */
import type { APIRoute } from 'astro';
import { SITE } from '@/config/site';

const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${new URL('/sitemap-0.xml', SITE.url).href}</loc></sitemap>
</sitemapindex>
`;

export const GET: APIRoute = () =>
  new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
