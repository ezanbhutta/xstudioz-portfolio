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
import { db } from '@/lib/db';
import { getProject } from '@/lib/admin-data';

/** Big enough for a 45-page deck, small enough that a stray file is refused. */
const MAX_BYTES = 60 * 1024 * 1024;

const back = (slug: string, message: string, ok = false) =>
  new Response(null, {
    status: 303,
    headers: {
      Location: `/admin/project/${slug}/?${ok ? 'uploaded' : 'uploadError'}=${encodeURIComponent(message)}`,
    },
  });

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug!;
  const project = await getProject(slug);
  if (!project) return back(slug, 'That project no longer exists.');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back(slug, 'The upload did not arrive completely. Try again.');
  }

  const file = form.get('pdf');
  if (!(file instanceof File) || file.size === 0) {
    return back(slug, 'Choose a PDF first.');
  }
  if (file.size > MAX_BYTES) {
    return back(
      slug,
      `That file is ${Math.round(file.size / 1024 / 1024)} MB; the limit is 60 MB.`,
    );
  }
  // Trust the bytes, not the name: the magic number is what actually says PDF.
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return back(slug, 'That file is not a PDF.');
  }

  let pages;
  try {
    pages = await renderPdf(bytes);
  } catch (error) {
    return back(slug, error instanceof Error ? error.message : 'That PDF could not be read.');
  }
  if (pages.length === 0) return back(slug, 'That PDF has no pages.');

  const title = project.title;

  try {
    // Everything to disk first. Names are deterministic, so re-uploading a
    // deck overwrites its own pages rather than accumulating orphans.
    const written = [];
    for (const page of pages) {
      const name = `page-${String(page.index).padStart(2, '0')}`;
      const out = await writeImage(page.png, slug, name);
      written.push({
        ...out,
        alt: `${title} presentation, page ${page.index} of ${pages.length}`,
      });
    }
    const cover = await writeImage(await makeCover(pages[0].png, project.category), slug, 'cover');

    // Then the database, in one transaction: a deck is all of its pages or
    // none of them, never the first twenty.
    const conn = await db().getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(`DELETE FROM project_images WHERE project_slug = ?`, [slug]);
      for (const [i, image] of written.entries()) {
        await conn.execute(
          `INSERT INTO project_images
             (project_slug, sort_order, src, alt, width, height, storage)
           VALUES (?,?,?,?,?,?, 'upload')`,
          [slug, i, image.src, image.alt, image.width, image.height],
        );
      }
      await conn.execute(
        `UPDATE projects
            SET cover = ?, cover_width = ?, cover_height = ?, cover_storage = 'upload',
                cover_alt = COALESCE(NULLIF(cover_alt, ''), ?), pdf = ?
          WHERE slug = ?`,
        [cover.src, cover.width, cover.height, `${title} presentation cover`, file.name, slug],
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    return back(slug, `${pages.length} pages published.`, true);
  } catch (error) {
    console.error('[upload]', error);
    return back(slug, 'The pages rendered but could not be saved. The old deck is unchanged.');
  }
};
