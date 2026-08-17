// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import { SITE } from './src/config/site';

export default defineConfig({
  site: SITE.url,
  // 'ignore' rather than 'always'.
  //
  // 'always' makes Astro answer any unslashed path with a 301 before routing,
  // before static assets, and before middleware — nothing in the app can
  // intercept it. Hostinger's deployment health check requests exactly
  // `/health`, does not follow redirects, and fails the deployment on any
  // non-200, so six deployments were failed by that redirect while the app
  // itself was starting and serving correctly.
  //
  // 'ignore' serves both spellings instead of enforcing one. Every link and
  // sitemap entry this site generates still carries the trailing slash, so the
  // canonical form is unchanged — Astro simply stops turning the other one
  // into a redirect the platform reads as a failure.
  trailingSlash: 'ignore',
  // Server-rendered so a content edit is live on the next request rather than
  // the next build. Hostinger runs the Node process on the same machine as
  // MySQL, so the database is reached over localhost and port 3306 never
  // opens to the internet.
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: {
    // Bind 0.0.0.0, not localhost.
    //
    // The standalone server takes its host from `server.host` here, not from
    // an option on the adapter. The default, localhost, is right for a laptop
    // and wrong for any host that puts a proxy in front of the process: the
    // server starts, answers nothing the proxy can reach, and the platform
    // reports a failed deployment underneath a build log that succeeded.
    //
    // Set here rather than via a HOST environment variable so it cannot be
    // forgotten when the app moves.
    host: true,

    // The port to fall back to when the platform does not set PORT.
    //
    // `process.env.PORT` still wins at runtime — this is only the default, and
    // it is 3000 rather than Astro's 4321 because 3000 is what Node hosts
    // proxy to by convention, Hostinger included. Listening on the wrong port
    // fails exactly like binding the wrong host: the process is healthy, the
    // build is green, and nothing can reach it.
    port: 3000,
  },
  security: {
    // Astro's own check compares the Origin header against `site`, which is
    // the production URL. That makes every POST fail anywhere else — on
    // localhost, on a staging domain, behind a preview URL — so the admin
    // could only ever be exercised in production. src/middleware.ts runs the
    // equivalent check against the request's real host instead, which blocks
    // the same cross-site form posts and can actually be tested.
    checkOrigin: false,
  },
  // No sitemap integration. It cannot see this site.
  //
  // @astrojs/sitemap enumerates routes at build time, and under `output:
  // 'server'` the only routes it can enumerate are the ones with no dynamic
  // segment. Every public page here is dynamic — categories come from
  // src/data/categories.json, case studies from MySQL — so the sitemap it
  // produced contained exactly the four static routes: `/` and the three
  // /admin/ pages. One public URL out of fourteen, and three that should
  // never be in a public sitemap at all.
  //
  // src/pages/sitemap-0.xml.ts answers the same URL from the database
  // instead, which is also the only way a case study published through the
  // admin appears without a rebuild.
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
