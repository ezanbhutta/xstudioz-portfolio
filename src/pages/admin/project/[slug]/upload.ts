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
import { renderPdf, trimBorder } from '@/lib/ingest';
import { writeImage, removeImage } from '@/lib/uploads';
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

/**
 * The description an image gets when it is first written.
 *
 * A deck page is a page of a document and is honestly described by its
 * position. An icon is not: "page 7 of 20" says nothing about a mark, and
 * twenty of them in a row is twenty rows of noise for a screen reader. So an
 * icon starts with the project's own name and waits to be named properly in
 * the admin, which is a blank worth leaving — a wrong description reads as
 * finished work and never gets revisited.
 */
const initialAlt = (title: string, layout: 'deck' | 'icons', n: number, total: number) =>
  layout === 'icons'
    ? `${title} — icon ${n} of ${total}`
    : `${title} presentation, page ${n} of ${total}`;

/**
 * Was this description written by the machine, or by a person?
 *
 * The two patterns above are the only shapes `initialAlt` produces, so an alt
 * matching neither is one somebody typed. Used to decide what a replacement
 * upload is allowed to overwrite — the same test the append path already made
 * inline in SQL, lifted out so both paths cannot drift apart.
 */
const isGeneratedAlt = (alt: string) =>
  / presentation, page \d+ of \d+$/.test(alt) || / — icon \d+ of \d+$/.test(alt);

/**
 * What a page carries with it across a replacement, by position.
 *
 * Replacing a deck used to be total: the rows went, and every icon name, kind
 * and hand-written description went with them. That is right for the images —
 * a replacement is a new export — and wrong for the words, which are the part
 * nobody re-derives. Twenty icons named one at a time were lost to fixing a
 * single mark and re-uploading.
 *
 * Position is the only correspondence available. Filenames restart at 1 on a
 * replace, so they identify nothing; sheet 7 of the new set is what sheet 7 of
 * the old one became. That is right when the export was corrected and wrong
 * when the set is a different set — so the finish message says how many
 * carried, rather than moving them silently.
 *
 * Generated descriptions are not carried. "page 7 of 36" is about a position
 * in a document, and the new document restates it correctly; carrying it would
 * pin an old page count onto a new deck.
 */
type Carried = { alt: string | null; label: string | null; logoType: string | null };

const carryFrom = (row: PriorPage | undefined): Carried => ({
  alt: row && row.alt && !isGeneratedAlt(row.alt) ? row.alt : null,
  label: row?.label ?? null,
  logoType: row?.logo_type ?? null,
});

const carriedAnything = (c: Carried) => Boolean(c.alt || c.label || c.logoType);

/** "12 sheets kept their caption." — said out loud, because it is a guess. */
function carriedNote(count: number, layout: 'deck' | 'icons'): string {
  if (count === 0) return '';
  const noun = layout === 'icons' ? 'sheet' : 'page';
  const what = layout === 'icons' ? 'caption' : 'description';
  return count === 1 ? ` One ${noun} kept its ${what}.` : ` ${count} ${noun}s kept their ${what}s.`;
}

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

/**
 * Failures worth trying again, rather than reporting.
 *
 * A shared plan caps threads and memory per account, and refuses over it with
 * EAGAIN — which surfaces from libvips as `glib: Error creating thread:
 * Resource temporarily unavailable`. Nothing is wrong with the deck or the
 * request: the account was momentarily at its ceiling, and the same page
 * usually renders a second later. Reporting that to the operator as a failed
 * upload puts them in the position of guessing whether to try again, which is
 * the machine's job.
 *
 * Deliberately narrow. Every other failure here is deterministic, and retrying
 * a deterministic failure only makes the operator wait longer for the same
 * answer.
 */
const TRANSIENT =
  /resource temporarily unavailable|EAGAIN|error creating thread|cannot allocate memory|ENOMEM|pthread/i;

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug!;

  // Nothing may escape as Astro's HTML error page: the client parses this as
  // JSON, so an HTML 500 reaches the operator as "the server sent something
  // unexpected" — a sentence with no information in it.
  try {
    return await route(slug, request);
  } catch (error) {
    console.error('[upload:fatal]', error);
    const transient = error instanceof Error && TRANSIENT.test(error.message);
    const message = !(error instanceof Error)
      ? 'The upload failed.'
      : transient
        ? `The server ran out of room to render that page (${error.message}).`
        : `The upload failed: ${error.message}`;
    return (request.headers.get('content-type') ?? '').includes('multipart/form-data') &&
      !(request.headers.get('accept') ?? '').includes('application/json')
      ? redirectBack(slug, message, false)
      : json({ error: message, retryable: transient }, transient ? 503 : 400);
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
      : await synchronousFallback(slug, project.title, project.layout, request);
  }

  const body = (await request.json()) as { action?: string; index?: number };
  if (body.action === 'render') {
    if (typeof body.index !== 'number') return json({ error: 'Expected a page number.' }, 400);
    return json({ ok: true, ...(await renderJobPage(slug, body.index)) });
  }
  if (body.action === 'finish') return await finish(slug, project.title, project.layout);
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

type PriorPage = {
  src: string;
  alt: string | null;
  label: string | null;
  logo_type: string | null;
};

/**
 * The deck as it stands, in display order.
 *
 * More than the paths now: a replacement needs to know what was typed about
 * each position before it deletes the row that holds it.
 */
async function existingPages(slug: string) {
  return query<PriorPage>(
    `SELECT src, alt, label, logo_type
       FROM project_images WHERE project_slug = ? ORDER BY sort_order`,
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
async function finish(slug: string, title: string, layout: 'deck' | 'icons'): Promise<Response> {
  const manifest = await readManifest(slug);
  if (!manifest) return json({ error: 'That upload is no longer in progress.' }, 409);
  if (manifest.done.length < manifest.total) {
    return json(
      { error: `Only ${manifest.done.length} of ${manifest.total} pages rendered.` },
      409,
    );
  }

  // Read before the rows go: their files have to be cleaned up afterwards,
  // and on a replace what was typed about each position has to outlive them.
  const prior = await existingPages(slug);
  const previous = manifest.append ? [] : prior.map((r) => r.src);

  await promoteJob(slug);

  const pages = [...manifest.done].sort((a, b) => a.index - b.index);
  const total = manifest.existing + pages.length;
  const written = new Set(pages.map((p) => pageSrc(slug, p.number)));

  // The cover is page one — the page itself, not a copy of it.
  //
  // This used to build a second image, reframed to the grid tile's fixed 16:9.
  // The tile has no fixed shape any more, so there is nothing to reframe, and
  // a derived file is only correct until the code that derived it changes. One
  // built while the framing cropped stayed cropped long after the cropping was
  // removed, because nothing re-ran it. A reference cannot go stale.
  const cover = manifest.append
    ? null
    : {
        src: pageSrc(slug, pages[0].number),
        width: pages[0].width,
        height: pages[0].height,
      };

  let carried = 0;

  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();
    if (!manifest.append) {
      await conn.execute(`DELETE FROM project_images WHERE project_slug = ?`, [slug]);
    }
    for (const [i, page] of pages.entries()) {
      // An append adds positions rather than replacing them, so there is
      // nothing at this position to carry anything from.
      const kept = manifest.append ? carryFrom(undefined) : carryFrom(prior[i]);
      if (carriedAnything(kept)) carried++;

      await conn.execute(
        `INSERT INTO project_images
           (project_slug, sort_order, src, alt, width, height, storage, label, logo_type, formats)
         VALUES (?,?,?,?,?,?, 'upload', ?, ?, ?)`,
        [
          slug,
          manifest.existing + i,
          pageSrc(slug, page.number),
          // Counted against the finished deck, not this batch — an appended
          // page calling itself "page 2 of 3" inside a 38-page book is a lie
          // to every screen reader that meets it.
          kept.alt ?? initialAlt(title, layout, manifest.existing + i + 1, total),
          page.width,
          page.height,
          kept.label,
          kept.logoType,
          // What the render actually produced. A page whose AVIF encode was
          // refused records 'webp' and is served exactly as it was before.
          page.formats ?? 'webp',
        ],
      );
    }
    if (manifest.append) {
      // Images already here still say "2 of 3" in a project that now has six.
      // Restate the total only on descriptions still carrying the generated
      // wording, so anything written by hand survives — and match the wording
      // this layout actually produces, or an appended icon set would leave
      // every existing caption claiming the old total.
      await conn.execute(
        layout === 'icons'
          ? `UPDATE project_images
                SET alt = CONCAT(?, ' — icon ', sort_order + 1, ' of ', ?)
              WHERE project_slug = ? AND alt REGEXP ?`
          : `UPDATE project_images
                SET alt = CONCAT(?, ' presentation, page ', sort_order + 1, ' of ', ?)
              WHERE project_slug = ? AND alt REGEXP ?`,
        [
          title,
          total,
          slug,
          layout === 'icons'
            ? '^.* — icon [0-9]+ of [0-9]+$'
            : '^.* presentation, page [0-9]+ of [0-9]+$',
        ],
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
  // The old standalone cover.webp goes too. Nothing can reference it any more
  // — the cover is a page now — so on a replace it is dead weight left behind
  // by the scheme this replaced.
  const dead = manifest.append ? [] : [`/uploads/${slug}/cover.webp`];
  await Promise.all([...previous.filter((src) => !written.has(src)), ...dead].map(removeImage));

  return json({
    ok: true,
    message: manifest.append
      ? `${pages.length} page${pages.length === 1 ? '' : 's'} added — ${total} in the deck.`
      : `${pages.length} page${pages.length === 1 ? '' : 's'} published.` +
        carriedNote(carried, layout),
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
  layout: 'deck' | 'icons',
  request: Request,
): Promise<Response> {
  const { bytes, name, append } = await takePdf(request);
  const pages = await renderPdf(bytes);
  if (pages.length === 0) return redirectBack(slug, 'That PDF has no pages.', false);

  const prior = await existingPages(slug);
  const existing = append ? prior : [];
  // What is being replaced, read before the rows go: its files have to be
  // cleaned up, and what was typed about each position has to outlive it.
  const previous = append ? [] : prior.map((r) => r.src);
  const firstNumber = append ? nextPageNumber(existing.map((r) => r.src)) : 1;
  const total = existing.length + pages.length;

  const trimmed = await Promise.all(pages.map((p) => trimBorder(p.png)));
  const written = [];
  for (const [i] of pages.entries()) {
    written.push(
      await writeImage(trimmed[i], slug, `page-${String(firstNumber + i).padStart(2, '0')}`),
    );
  }
  // Page one itself, as above — a reference, not a second copy of it.
  const cover = append ? null : written[0];

  let carried = 0;

  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();
    if (!append) {
      await conn.execute(`DELETE FROM project_images WHERE project_slug = ?`, [slug]);
    }
    for (const [i, image] of written.entries()) {
      const kept = append ? carryFrom(undefined) : carryFrom(prior[i]);
      if (carriedAnything(kept)) carried++;

      await conn.execute(
        `INSERT INTO project_images
           (project_slug, sort_order, src, alt, width, height, storage, label, logo_type, formats)
         VALUES (?,?,?,?,?,?, 'upload', ?, ?, ?)`,
        [
          slug,
          existing.length + i,
          image.src,
          kept.alt ?? initialAlt(title, layout, existing.length + i + 1, total),
          image.width,
          image.height,
          kept.label,
          kept.logoType,
          image.formats,
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

  // As above: the replaced deck's files, minus the names the new deck reuses,
  // plus the standalone cover nothing references any more.
  const keep = new Set(written.map((image) => image.src));
  const dead = append ? [] : [`/uploads/${slug}/cover.webp`];
  await Promise.all([...previous.filter((src) => !keep.has(src)), ...dead].map(removeImage));

  return redirectBack(
    slug,
    `${pages.length} pages published.` + carriedNote(carried, layout),
    true,
  );
}
