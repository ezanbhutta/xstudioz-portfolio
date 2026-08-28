/**
 * Rebuild the image variants for everything already published.
 *
 * One image per request, driven by a loop in the browser — the same shape as
 * the deck upload, for the same reason. Rebuilding seventeen images means
 * around a hundred and forty encodes; done in one request that is a gateway
 * timeout on this host, and the operator is told nothing until it fails.
 *
 * Nothing here is destructive. Every file the pages currently point at is left
 * exactly as it is; this only writes the rungs and formats that are missing
 * beside them, and updates the row to say what is now there. Running it twice
 * costs a handful of `access` calls and changes nothing.
 */
import type { APIRoute } from 'astro';
import { formatsColumnExists, listRebuildTargets, rebuildOne } from '@/lib/image-maintenance';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as { action?: string; index?: number };

    if (body.action === 'list') {
      if (!(await formatsColumnExists())) {
        return json(
          {
            error:
              'The database has not run db/migrations/003-image-formats.sql yet. ' +
              'Run it, then try again — nothing has been changed.',
          },
          409,
        );
      }
      const targets = await listRebuildTargets();
      return json({
        ok: true,
        total: targets.length,
        pending: targets.filter((t) => !t.formats.includes('avif')).length,
      });
    }

    if (body.action === 'one') {
      const targets = await listRebuildTargets();
      const index = Number(body.index);
      if (!Number.isInteger(index) || index < 0 || index >= targets.length) {
        return json({ error: 'No image at that position.' }, 400);
      }
      const result = await rebuildOne(targets[index]);
      return json({ ok: true, index, total: targets.length, ...result });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    console.error('[rebuild:fatal]', error);
    return json({ error: error instanceof Error ? error.message : 'That failed.' }, 500);
  }
};
