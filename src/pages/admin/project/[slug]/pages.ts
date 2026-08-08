/**
 * Page-level edits to a deck, as JSON.
 *
 * Reorder, delete and retitle happen without leaving the editor, because the
 * alternative — a form POST and a full reload per page — makes rearranging a
 * thirty-six page deck unusable. The operator drags, and the drop is saved.
 *
 * Authentication is not repeated here: `src/middleware.ts` gates everything
 * under /admin, which is the point of doing it there. Origin *is* checked,
 * because Astro's built-in CSRF guard only inspects form content types and
 * these are JSON — without this, any site could POST here with the operator's
 * cookie riding along and delete a deck a page at a time.
 */
import type { APIRoute } from 'astro';
import { reorderPages, deletePage, setPageAlt, listPages } from '@/lib/deck';
import { getProject } from '@/lib/admin-data';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/**
 * Same-origin only. A missing Origin header is refused rather than assumed.
 *
 * Compares the Origin's *host* against the request's Host header, not against
 * `url.origin`. In production this runs behind Apache, which terminates TLS
 * and forwards plain HTTP: the browser sends `Origin: https://xstudioz.com`
 * while the app sees `url.protocol === 'http:'`, so a full-origin comparison
 * rejects every legitimate request and the admin stops working the moment it
 * is deployed. Host and port still have to match, which is what actually
 * distinguishes this site from an attacker's.
 */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // Unparseable Origin — not a browser we want to trust.
  }
}

export const POST: APIRoute = async ({ params, request }) => {
  if (!sameOrigin(request)) {
    return json({ error: 'Cross-site requests are refused.' }, 403);
  }

  const slug = params.slug!;
  if (!(await getProject(slug))) {
    return json({ error: 'That project no longer exists.' }, 404);
  }

  let body: { action?: string; src?: string; order?: unknown; alt?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  try {
    switch (body.action) {
      case 'reorder': {
        if (!Array.isArray(body.order) || body.order.some((s) => typeof s !== 'string')) {
          return json({ error: 'Expected an order of page paths.' }, 400);
        }
        const count = await reorderPages(slug, body.order as string[]);
        return json({ ok: true, count });
      }

      case 'delete': {
        if (typeof body.src !== 'string') return json({ error: 'Expected a page.' }, 400);
        const removed = await deletePage(slug, body.src);
        if (!removed) return json({ error: 'That page is already gone.' }, 404);
        // The remaining pages come back so the editor can renumber without
        // guessing what the server ended up with.
        return json({ ok: true, pages: await listPages(slug) });
      }

      case 'alt': {
        if (typeof body.src !== 'string' || typeof body.alt !== 'string') {
          return json({ error: 'Expected a page and its description.' }, 400);
        }
        const updated = await setPageAlt(slug, body.src, body.alt);
        if (!updated) return json({ error: 'That page is no longer in this deck.' }, 404);
        return json({ ok: true });
      }

      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (error) {
    console.error('[pages]', error);
    // The specific SQL failure is not the operator's business, and echoing it
    // would leak schema. The log has it.
    return json({ error: 'That change could not be saved. Nothing was altered.' }, 500);
  }
};
