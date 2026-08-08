/**
 * Upload a deck.
 *
 * Takes a PDF, renders every page, writes the WebP variants, and replaces the
 * project's images — all inside the request, so the case study is complete by
 * the time the redirect lands. No build, no deploy, no queue.
 *
 * The database is written last, and only after every page has rendered and
 * been saved. A crash halfway through therefore leaves the old deck intact
 * rather than a project pointing at files that were never finished.
 */
import type { APIRoute } from 'astro';
import { renderPdf, makeCover } from '@/lib/ingest';
import { writeImage } from '@/lib/uploads';
import { db, query } from '@/lib/db';
import { getProject } from '@/lib/admin-data';

/** Big enough for a 45-page deck, small enough that a stray file is refused. */
const MAX_BYTES = 60 * 1024 * 1024;

/**
 * Two callers, two answers.
 *
 * Without JavaScript this is a plain form POST and the browser needs a
 * redirect. The editor uploads over XHR instead — the only way to show real
 * progress on a 60 MB file — and a redirect there just hands back the HTML of
 * the page it is already on. Same work, and the shape of the reply follows
 * what the caller asked for.
 */
const respond = (slug: string, message: string, ok: boolean, wantsJson: boolean) =>
  wantsJson
    ? new Response(JSON.stringify(ok ? { ok, message } : { error: message }), {
        status: ok ? 200 : 400,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    : new Response(null, {
        status: 303,
        headers: {
          Location: `/admin/project/${slug}/?${ok ? 'uploaded' : 'uploadError'}=${encodeURIComponent(message)}`,
        },
      });

/**
 * Where the next page's filename starts.
 *
 * Appending has to continue past the highest number already written, not past
 * the page *count*. Those differ the moment a page is deleted, and reusing a
 * number would overwrite a page that is still in the deck — writeImage names
 * files deterministically, so the collision is silent and destroys the image.
 */
function nextPageNumber(srcs: string[]): number {
  let highest = 0;
  for (const src of srcs) {
    const match = /\/page-(\d+)\.webp$/.exec(src);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug!;
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const back = (message: string, ok = false) => respond(slug, message, ok, wantsJson);

  const project = await getProject(slug);
  if (!project) return back('That project no longer exists.');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back('The upload did not arrive completely. Try again.');
  }

  const file = form.get('pdf');
  if (!(file instanceof File) || file.size === 0) {
    return back('Choose a PDF first.');
  }
  if (file.size > MAX_BYTES) {
    return back(`That file is ${Math.round(file.size / 1024 / 1024)} MB; the limit is 60 MB.`);
  }
  // Trust the bytes, not the name: the magic number is what actually says PDF.
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return back('That file is not a PDF.');
  }

  let pages;
  try {
    pages = await renderPdf(bytes);
  } catch (error) {
    return back(error instanceof Error ? error.message : 'That PDF could not be read.');
  }
  if (pages.length === 0) return back('That PDF has no pages.');

  const title = project.title;
  // 'append' adds to the deck; anything else replaces it, so the default for a
  // malformed or absent field is the behaviour that was here before.
  const append = String(form.get('mode') ?? '') === 'append';

  const existing = append
    ? await query<{ src: string }>(
        `SELECT src FROM project_images WHERE project_slug = ? ORDER BY sort_order`,
        [slug],
      )
    : [];
  const firstNumber = append ? nextPageNumber(existing.map((r) => r.src)) : 1;

  try {
    // Everything to disk first. Names are deterministic, so re-uploading a
    // deck overwrites its own pages rather than accumulating orphans.
    const total = existing.length + pages.length;
    const written = [];
    for (const [i, page] of pages.entries()) {
      const number = firstNumber + i;
      const name = `page-${String(number).padStart(2, '0')}`;
      const out = await writeImage(page.png, slug, name);
      written.push({
        ...out,
        // Counted against the finished deck, not this batch — an appended page
        // that calls itself "page 2 of 3" inside a 38-page book is a lie to
        // every screen reader that meets it.
        alt: `${title} presentation, page ${existing.length + i + 1} of ${total}`,
      });
    }
    // Appending leaves the cover alone. The cover is page one of the deck, and
    // pages added to the end are not page one.
    const cover = append
      ? null
      : await writeImage(await makeCover(pages[0].png, project.category), slug, 'cover');

    // Then the database, in one transaction: a deck is all of its pages or
    // none of them, never the first twenty.
    const conn = await db().getConnection();
    try {
      await conn.beginTransaction();
      if (!append) {
        await conn.execute(`DELETE FROM project_images WHERE project_slug = ?`, [slug]);
      }
      for (const [i, image] of written.entries()) {
        await conn.execute(
          `INSERT INTO project_images
             (project_slug, sort_order, src, alt, width, height, storage)
           VALUES (?,?,?,?,?,?, 'upload')`,
          [slug, existing.length + i, image.src, image.alt, image.width, image.height],
        );
      }
      if (append) {
        // The pages that were already here still say "page 2 of 3" in a deck
        // that now has six. Restate the total on the ones still carrying the
        // generated wording, matched on that exact shape so a description the
        // operator wrote by hand is never overwritten by a bookkeeping update.
        await conn.execute(
          `UPDATE project_images
              SET alt = CONCAT(?, ' presentation, page ', sort_order + 1, ' of ', ?)
            WHERE project_slug = ?
              AND alt REGEXP ?`,
          [title, total, slug, '^.* presentation, page [0-9]+ of [0-9]+$'],
        );
      }
      if (cover) {
        await conn.execute(
          `UPDATE projects
              SET cover = ?, cover_width = ?, cover_height = ?, cover_storage = 'upload',
                  cover_alt = COALESCE(NULLIF(cover_alt, ''), ?), pdf = ?
            WHERE slug = ?`,
          [cover.src, cover.width, cover.height, `${title} presentation cover`, file.name, slug],
        );
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    const message = append
      ? `${pages.length} page${pages.length === 1 ? '' : 's'} added — ${total} in the deck.`
      : `${pages.length} pages published.`;
    return back(message, true);
  } catch (error) {
    console.error('[upload]', error);
    return back('The pages rendered but could not be saved. The old deck is unchanged.');
  }
};
