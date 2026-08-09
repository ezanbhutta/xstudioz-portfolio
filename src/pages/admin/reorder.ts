/**
 * Reorder the projects on the grid.
 *
 * Position used to be a number typed into each project's own editor, which
 * meant rearranging the grid was: open a project, guess a number, save, go
 * back, open the next one, discover the numbers now collide. The list can do
 * it directly, and this is what the drop posts to.
 *
 * Auth comes from src/middleware.ts, which gates everything under /admin.
 * Origin is checked here because Astro's CSRF guard only inspects form content
 * types and this is JSON.
 */
import type { APIRoute } from 'astro';
import { reorderProjects } from '@/lib/deck';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** Host, not full origin: Apache terminates TLS, so the schemes never match. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) {
    return json({ error: 'Cross-site requests are refused.' }, 403);
  }

  let body: { order?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  if (!Array.isArray(body.order) || body.order.some((s) => typeof s !== 'string')) {
    return json({ error: 'Expected an order of project slugs.' }, 400);
  }

  try {
    const count = await reorderProjects(body.order as string[]);
    return json({ ok: true, count });
  } catch (error) {
    console.error('[reorder]', error);
    return json({ error: 'That order could not be saved. Nothing was changed.' }, 500);
  }
};
