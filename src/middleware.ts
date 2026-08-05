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

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;

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
