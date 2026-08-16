/**
 * Upload a deck.
 *
 * Three steps, because one was impossible on this host.
 *
 *   POST multipart          start  — keep the PDF, count its pages
 *   POST {action:'render'}  render — rasterise one page
 *   POST {action:'finish'}  finish — promote the pages, write the database
 *
 * Rendering used to happen inside the upload request. Hostinger's proxy
 * answered a 3.2 MB deck with a 504, then a 503 on retry: the work outlived
 * the gateway, and a large enough deck took the process with it. Splitting the
 * render across one request per page makes every request short whatever the
 * deck's size, and gives the operator a page count that moves instead of a
 * progress bar that fills and then hangs on the server's silence.
 *
 * The database is still written last, in one transaction, and only once every
 * page has rendered and been promoted. A deck is all of its pages or none of
 * them — an upload abandoned halfway leaves the previous deck untouched.
 *
 * Without JavaScript the form posts and renders synchronously, as before. That
 * still works for a short deck and is the only thing that can work without a
 * client to drive the loop; a long one will fail there exactly as it did.
 */
import type { APIRoute } from 'astro';
import { renderPdf, makeCover, trimBorder } from '@/lib/ingest';
import { writeImage, readUpload, removeImage } from '@/lib/uploads';
import { db, query } from '@/lib/db';
import { getProject } from '@/lib/admin-data';
import { startJob, renderJobPage, promoteJob, clearJob, readManifest } from '@/lib/deck-job';

/** Big enough for a 45-page deck, small enough that a stray file is refused. */
const MAX_BYTES = 60 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** The no-JS path needs a redirect; the browser client needs JSON. */
const redirectBack = (slug: string, message: string, ok: boolean) =>
  new Response(null, {
    status: 303,
    headers: {
      Location: `/admin/project/${slug}/?${ok ? 'uploaded' : 'uploadError'}=${encodeURIComponent(message)}`,
    },
  });

/** Where a page's file lives, given its number. One spelling, used everywhere. */
const pageSrc = (slug: string, number: number) =>
  `/uploads/${slug}/page-${String(number).padStart(2, '0')}.webp`;

/**
 * Where an appended page's filename starts.
 *
 * Past the highest number already written, not past the page count — those
 * differ once a page has been deleted, and reusing a number silently
 * overwrites a page that is still in the deck.
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

  // Nothing may escape as Astro's HTML error page: the client parses this as
  // JSON, so an HTML 500 reaches the operator as "the server sent something
  // unexpected" — a sentence with no information in it.
  try {
    return await route(slug, request);
  } catch (error) {
    console.error('[upload:fatal]', error);
    const message =
      error instanceof Error ? `The upload failed: ${error.message}` : 'The upload failed.';
    return (request.headers.get('content-type') ?? '').includes('multipart/form-data') &&
      !(request.headers.get('accept') ?? '').includes('application/json')
      ? redirectBack(slug, message, false)
      : json({ error: message }, 400);
  }
};

async function route(slug: string, request: Request): Promise<Response> {
  const project = await getProject(slug);
  if (!project) return json({ error: 'That project no longer exists.' }, 404);

  const type = request.headers.get('content-type') ?? '';
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');

  if (type.includes('multipart/form-data')) {
    return wantsJson
      ? await start(slug, request)
      : await synchronousFallback(slug, project.title, request);
  }

  const body = (await request.json()) as { action?: string; index?: number };
  if (body.action === 'render') {
    if (typeof body.index !== 'number') return json({ error: 'Expected a page number.' }, 400);
    return json({ ok: true, ...(await renderJobPage(slug, body.index)) });
  }
  if (body.action === 'finish') return await finish(slug, project.title);
  if (body.action === 'cancel') {
    await clearJob(slug);
    return json({ ok: true });
  }
  return json({ error: 'Unknown action.' }, 400);
}

/** Read and validate the PDF out of a multipart body. */
async function takePdf(
  request: Request,
): Promise<{ bytes: Buffer; name: string; append: boolean }> {
  const form = await request.formData();
  const file = form.get('pdf');
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose a PDF first.');
  if (file.size > MAX_BYTES) {
    throw new Error(`That file is ${Math.round(file.size / 1024 / 1024)} MB; the limit is 60 MB.`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  // Trust the bytes, not the name: the magic number is what says PDF.
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-')
    throw new Error('That file is not a PDF.');
  return { bytes, name: file.name, append: String(form.get('mode') ?? '') === 'append' };
}

async function existingPages(slug: string) {
  return query<{ src: string }>(
    `SELECT src FROM project_images WHERE project_slug = ? ORDER BY sort_order`,
    [slug],
  );
}

async function start(slug: string, request: Request): Promise<Response> {
  const { bytes, name, append } = await takePdf(request);
  const existing = append ? await existingPages(slug) : [];
  const { total } = await startJob(
    slug,
    bytes,
    name,
    append,
    existing.length,
    append ? nextPageNumber(existing.map((r) => r.src)) : 1,
  );
  return json({ ok: true, total });
}

/**
 * Commit the rendered deck.
 *
 * Files move first and the database second: a row pointing at a file that is
 * not there yet renders a broken page, while a file with no row is an orphan
 * nobody sees.
 */
async function finish(slug: string, title: string): Promise<Response> {
  const manifest = await readManifest(slug);
  if (!manifest) return json({ error: 'That upload is no longer in progress.' }, 409);
  if (manifest.done.length < manifest.total) {
    return json(
      { error: `Only ${manifest.done.length} of ${manifest.total} pages rendered.` },
      409,
    );
  }

  // Noted before the rows go, so the files they leave behind can go too.
  const previous = manifest.append ? [] : (await existingPages(slug)).map((r) => r.src);

  await promoteJob(slug);

  const pages = [...manifest.done].sort((a, b) => a.index - b.index);
  const total = manifest.existing + pages.length;
  const written = new Set(pages.map((p) => pageSrc(slug, p.number)));

  // The cover is page one, reframed. Read back the page just promoted rather
  // than keeping a buffer across requests — there is no across-requests here.
  const cover = manifest.append
    ? null
    : await (async () => {
        const first = await readUpload(
          slug,
          `page-${String(pages[0].number).padStart(2, '0')}.webp`,
        );
        if (!first) return null;
        return writeImage(await makeCover(first), slug, 'cover');
      })();

  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();
    if (!manifest.append) {
      await conn.execute(`DELETE FROM project_images WHERE project_slug = ?`, [slug]);
    }
    for (const [i, page] of pages.entries()) {
      await conn.execute(
        `INSERT INTO project_images
           (project_slug, sort_order, src, alt, width, height, storage)
         VALUES (?,?,?,?,?,?, 'upload')`,
        [
          slug,
          manifest.existing + i,
          pageSrc(slug, page.number),
          // Counted against the finished deck, not this batch — an appended
          // page calling itself "page 2 of 3" inside a 38-page book is a lie
          // to every screen reader that meets it.
          `${title} presentation, page ${manifest.existing + i + 1} of ${total}`,
          page.width,
          page.height,
        ],
      );
    }
    if (manifest.append) {
      // Pages already here still say "page 2 of 3" in a deck that now has six.
      // Restate the total only on descriptions still carrying the generated
      // wording, so anything written by hand survives.
      await conn.execute(
        `UPDATE project_images
            SET alt = CONCAT(?, ' presentation, page ', sort_order + 1, ' of ', ?)
          WHERE project_slug = ? AND alt REGEXP ?`,
        [title, total, slug, '^.* presentation, page [0-9]+ of [0-9]+$'],
      );
    }
    if (cover) {
      await conn.execute(
        `UPDATE projects
            SET cover = ?, cover_width = ?, cover_height = ?, cover_storage = 'upload',
                cover_alt = COALESCE(NULLIF(cover_alt, ''), ?), pdf = ?
          WHERE slug = ?`,
        [
          cover.src,
          cover.width,
          cover.height,
          `${title} presentation cover`,
          manifest.filename,
          slug,
        ],
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  await clearJob(slug);

  // The old deck's files, now that nothing points at them.
  //
  // Deleting the rows never deleted the images, so every replacement upload
  // left a full deck of orphaned webp behind — on a host where uploads live on
  // a fixed allowance, replacing a 45-page deck a handful of times is how that
  // allowance runs out. Pages the new deck reuses by name are excluded: those
  // files are the new deck.
  await Promise.all(previous.filter((src) => !written.has(src)).map(removeImage));

  return json({
    ok: true,
    message: manifest.append
      ? `${pages.length} page${pages.length === 1 ? '' : 's'} added — ${total} in the deck.`
      : `${pages.length} page${pages.length === 1 ? '' : 's'} published.`,
  });
}

/**
 * The whole deck in one request, for a browser with no JavaScript.
 *
 * Kept because it is the only thing that can work without a client to drive
 * the loop, and it is fine for a short deck. A long one fails here the way it
 * always did — which is precisely why the path above exists.
 */
async function synchronousFallback(
  slug: string,
  title: string,
  request: Request,
): Promise<Response> {
  const { bytes, name, append } = await takePdf(request);
  const pages = await renderPdf(bytes);
  if (pages.length === 0) return redirectBack(slug, 'That PDF has no pages.', false);

  const existing = append ? await existingPages(slug) : [];
  // What is being replaced, noted before the rows go so its files can go too.
  const previous = append ? [] : (await existingPages(slug)).map((r) => r.src);
  const firstNumber = append ? nextPageNumber(existing.map((r) => r.src)) : 1;
  const total = existing.length + pages.length;

  const trimmed = await Promise.all(pages.map((p) => trimBorder(p.png)));
  const written = [];
  for (const [i] of pages.entries()) {
    written.push(
      await writeImage(trimmed[i], slug, `page-${String(firstNumber + i).padStart(2, '0')}`),
    );
  }
  const cover = append ? null : await writeImage(await makeCover(trimmed[0]), slug, 'cover');

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
        [
          slug,
          existing.length + i,
          image.src,
          `${title} presentation, page ${existing.length + i + 1} of ${total}`,
          image.width,
          image.height,
        ],
      );
    }
    if (cover) {
      await conn.execute(
        `UPDATE projects
            SET cover = ?, cover_width = ?, cover_height = ?, cover_storage = 'upload',
                cover_alt = COALESCE(NULLIF(cover_alt, ''), ?), pdf = ?
          WHERE slug = ?`,
        [cover.src, cover.width, cover.height, `${title} presentation cover`, name, slug],
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  // As above: the replaced deck's files, minus the names the new deck reuses.
  const keep = new Set(written.map((image) => image.src));
  await Promise.all(previous.filter((src) => !keep.has(src)).map(removeImage));

  return redirectBack(slug, `${pages.length} pages published.`, true);
}
