/**
 * The sitemap itself: every public page, and nothing else.
 *
 * This replaces @astrojs/sitemap, which could not work here. It enumerates
 * routes at build time, and under `output: 'server'` the only routes it can
 * enumerate are those with no dynamic segment. Every public page on this site
 * is dynamic — categories come from src/data/categories.json, case studies
 * from MySQL — so what it published was `/` plus /admin/, /admin/login/ and
 * /admin/settings/: one public URL out of fourteen, and three that should
 * never appear in a public sitemap.
 *
 * Built per request rather than per deploy, because a case study published
 * through the admin exists the moment it is saved and there is no rebuild
 * afterwards to notice it.
 *
 * The URL is unchanged, so robots.txt still points at the right place and
 * anything already submitted to Search Console keeps resolving.
 */
import type { APIRoute } from 'astro';
import { SITE } from '@/config/site';
import { CATEGORIES } from '@/data/categories';
import { getSortedProjects, databaseError } from '@/lib/content';

/** Slugs are machine-generated, but a sitemap that can be malformed by data is
 *  a sitemap nobody can trust. */
const xml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async () => {
  const projects = await getSortedProjects();

  /**
   * A truncated sitemap is worse than no sitemap.
   *
   * `getSortedProjects` answers with an empty list when MySQL is unreachable,
   * so a database blip during a crawl would publish a valid-looking document
   * that had quietly dropped every case study — telling Google those eight
   * pages are gone. A 503 says "ask again later", which is the truth, and
   * crawlers treat it as exactly that.
   */
  if (projects.length === 0 && databaseError()) {
    return new Response('Sitemap unavailable: the database could not be reached.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const paths = [
    '/',
    // Every category, not only the active ones. Turning a service off removes
    // it from navigation and nothing else — see the note in
    // src/pages/[category]/index.astro — so the page keeps returning 200 and
    // keeps being indexable, and a sitemap that omitted it would be wrong
    // about the site rather than tidy.
    ...CATEGORIES.map((category) => `/${category.id}/`),
    // Exactly the projects the case study route will serve: it resolves the
    // same list and 404s on anything missing from it, so a project whose
    // images do not resolve cannot end up in here as a dead URL.
    ...projects.map((project) => `/work/${project.id}/`),
  ];

  // Trailing slashes throughout, matching the canonical tag in BaseLayout,
  // which is built from the request path — and every internal link on the
  // site carries one. A sitemap disagreeing with its own canonicals is a
  // duplicate-content report waiting to happen.
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${xml(new URL(path, SITE.url).href)}</loc></url>`).join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
