/**
 * Gate every /admin/ route behind the session cookie.
 *
 * A middleware rather than a check inside each page: a page that forgets the
 * check is a page that leaks edit access, and "remember to add four lines to
 * every new admin route" is a rule that gets broken eventually. Here the
 * default is closed and a route has to be explicitly listed to be public.
 */
import { defineMiddleware } from 'astro:middleware';
import { isSignedIn, COOKIE_NAME } from '@/lib/auth';
import { readUpload } from '@/lib/uploads';
import { healthReport } from '@/lib/health';

/** The only /admin/ paths reachable without a session. */
const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/admin/login/']);

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Cross-site request forgery.
 *
 * The session cookie is SameSite=Lax, which already stops a cross-site form
 * post from carrying it. This is the second lock: browsers send `Origin` on
 * every state-changing request, so a POST whose Origin is not this site is
 * refused outright.
 *
 * Compared against the request's own Host rather than the configured `site`,
 * which is what Astro's built-in check uses. Tying it to the production URL
 * means the admin cannot be exercised anywhere else — and a security control
 * that only runs in production is a control nobody has ever seen work.
 */
function isCrossSite(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  // No Origin at all: not a browser form post. Curl and server-side clients
  // land here, and they have no ambient session to abuse.
  if (!origin) return true;
  const host = request.headers.get('host');
  try {
    return new URL(origin).host !== (host ?? url.host);
  } catch {
    return true;
  }
}

/** Content types for the files the admin can write. */
const TYPES: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
};

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;

  /**
   * Health check, answered before routing.
   *
   * The platform requests exactly `/health`, does not follow redirects, and
   * fails the deployment on anything that is not a 200. With
   * `trailingSlash: 'always'` a page at this path answers `/health/` and
   * redirects `/health` — so the app started correctly and the deployment was
   * failed anyway, six times, by a 301 nobody could see.
   *
   * Both spellings answer here, ahead of the redirect that caused it.
   */
  if (path === '/health' || path === '/health/') {
    return healthReport();
  }

  /**
   * Uploaded images, served before routing.
   *
   * The site sets `trailingSlash: 'always'`, so a request for
   * `/uploads/slug/page-01.webp` is redirected to the same path with a slash
   * appended — and an <img src> never has one, so every uploaded image 404s.
   * That stayed hidden while the files also happened to exist in `dist/`
   * from the build; once uploads live only on disk, it would have broken
   * every image on the site.
   *
   * Handling it here runs before that redirect. In production Apache serves
   * these files first and this never executes, but it is what makes the site
   * correct when it doesn't.
   */
  if (path.startsWith('/uploads/')) {
    const [, , slug, file] = path.split('/');
    if (slug && file) {
      const body = await readUpload(slug, file);
      if (body) {
        return new Response(new Uint8Array(body), {
          headers: {
            'Content-Type':
              TYPES[file.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream',
            // Immutable: a re-upload writes new bytes under the same
            // deterministic name only when the deck itself is replaced, and
            // that is a deliberate act with a visible result.
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Length': String(body.length),
          },
        });
      }
      return new Response('Not found', { status: 404 });
    }
  }

  if (!path.startsWith('/admin')) return next();

  if (UNSAFE_METHODS.has(context.request.method) && isCrossSite(context.request, context.url)) {
    return new Response('Cross-site form submissions are forbidden.', { status: 403 });
  }
  if (PUBLIC_ADMIN_PATHS.has(path)) return next();

  if (!isSignedIn(context.cookies.get(COOKIE_NAME)?.value)) {
    // Remember where they were headed so signing in lands them there rather
    // than dumping them on the dashboard.
    const next_ = encodeURIComponent(path + context.url.search);
    return context.redirect(`/admin/login/?next=${next_}`, 302);
  }

  const response = await next();
  // The admin renders unpublished edits and is per-operator. Caching any of it
  // — in a browser, a proxy, or Hostinger's CDN — risks showing one state
  // while the database holds another.
  response.headers.set('Cache-Control', 'no-store, must-revalidate');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
});
