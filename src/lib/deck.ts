/**
 * Page-level operations on a project's deck.
 *
 * Uploading a PDF replaces the whole deck, which is the right default — a deck
 * is a document and its pages arrive together. But it was also the *only*
 * operation. Fixing one wrong page, dropping a slide the client cut, or
 * correcting alt text meant re-exporting the PDF and re-uploading all
 * thirty-six pages. These are the edits that were missing.
 *
 * `project_images` is keyed on (project_slug, sort_order), so position is
 * identity here: there is no row id to move around, and any operation that
 * changes order has to avoid colliding with a position that still exists.
 * Every function below is written around that, and every one runs in a
 * transaction — a deck that is half-reordered is worse than one that never
 * moved.
 */
import { db, query } from '@/lib/db';
import { removeImage } from '@/lib/uploads';
import { resolveImage } from '@/lib/content';

export type DeckPage = {
  /** The stored path. This is the page's identity in every operation below. */
  src: string;
  alt: string;
  sortOrder: number;
  /**
   * What to actually put in an <img>.
   *
   * Not the same as `src`. An uploaded page stores a servable URL, but a page
   * still on the original arrangement stores a relative path like
   * "./page-01.png" that only the build glob can turn into a URL — so a
   * thumbnail built naively from `src` renders a broken image for every
   * project the upload migration has not touched. Undefined when the row
   * cannot be resolved at all, which the UI shows as a placeholder rather
   * than a broken tile.
   */
  display?: { src: string; srcset?: string; width: number; height: number };
};

/** Every page of a deck, in display order. */
export async function listPages(slug: string): Promise<DeckPage[]> {
  const rows = await query<{
    src: string;
    alt: string;
    width: number | null;
    height: number | null;
    storage: string;
    sort_order: number;
  }>(
    `SELECT src, alt, width, height, storage, sort_order
       FROM project_images
      WHERE project_slug = ?
      ORDER BY sort_order`,
    [slug],
  );
  return rows.map((r) => ({
    src: r.src,
    alt: r.alt,
    sortOrder: r.sort_order,
    display: resolveImage(slug, r.src, r.storage, r.width, r.height),
  }));
}

/**
 * Put the deck in the given order.
 *
 * `order` is the full list of page `src` values as the operator arranged them.
 * Anything already stored that is missing from the list is left where it is
 * rather than deleted — a reorder request that silently dropped pages because
 * the browser sent a stale list would be an appalling way to lose a deck.
 *
 * The two-pass shift is what the composite primary key forces. Writing final
 * positions directly would collide the moment a page moves into a slot that
 * another page has not vacated yet, so every row is first parked above the
 * range in use and then brought down to its final position.
 */
export async function reorderPages(slug: string, order: string[]): Promise<number> {
  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = (await conn.execute(
      `SELECT src, sort_order FROM project_images WHERE project_slug = ? ORDER BY sort_order`,
      [slug],
    )) as unknown as [Array<{ src: string; sort_order: number }>, unknown];

    const known = new Set(rows.map((r) => r.src));
    // Requested order first, restricted to pages that exist; then anything the
    // caller did not mention, in its current order.
    const wanted = order.filter((src) => known.has(src));
    const seen = new Set(wanted);
    const final = [...wanted, ...rows.filter((r) => !seen.has(r.src)).map((r) => r.src)];

    // Park everything above the occupied range. Offsetting by the row count
    // rather than a fixed constant keeps this correct for a deck of any size.
    const offset = rows.length + 1000;
    await conn.execute(
      `UPDATE project_images SET sort_order = sort_order + ?
        WHERE project_slug = ?
        ORDER BY sort_order DESC`,
      [offset, slug],
    );

    for (const [i, src] of final.entries()) {
      await conn.execute(
        `UPDATE project_images SET sort_order = ? WHERE project_slug = ? AND src = ?`,
        [i, slug, src],
      );
    }

    await conn.commit();
    return final.length;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Remove one page and close the gap it leaves.
 *
 * The row goes first and the files second. If the unlink fails the page is
 * still gone from the site, which is what was asked for; an orphaned webp
 * costs disk and nothing else. Doing it the other way round risks a page that
 * renders a broken image because the row outlived its file.
 */
export async function deletePage(slug: string, src: string): Promise<boolean> {
  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = (await conn.execute(
      `SELECT sort_order FROM project_images WHERE project_slug = ? AND src = ?`,
      [slug, src],
    )) as unknown as [Array<{ sort_order: number }>, unknown];

    if (rows.length === 0) {
      await conn.rollback();
      return false;
    }
    const position = rows[0].sort_order;

    await conn.execute(`DELETE FROM project_images WHERE project_slug = ? AND src = ?`, [
      slug,
      src,
    ]);

    // Close the gap. Ascending order matters: each row moves into a slot the
    // previous one has already left, so the unique key is never violated
    // mid-statement.
    await conn.execute(
      `UPDATE project_images SET sort_order = sort_order - 1
        WHERE project_slug = ? AND sort_order > ?
        ORDER BY sort_order ASC`,
      [slug, position],
    );

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  await removeImage(src);
  return true;
}

/**
 * Rewrite one page's alt text.
 *
 * Uploading names pages "<title> presentation, page 3 of 36", which is honest
 * but says nothing about what is on the page. This is how that gets fixed for
 * the pages where it matters, without re-uploading the deck.
 */
export async function setPageAlt(slug: string, src: string, alt: string): Promise<boolean> {
  // Not the shared `query()` helper: it returns the row array, which for an
  // UPDATE is the result header, so affectedRows is unreachable through it.
  const [result] = await db().execute(
    `UPDATE project_images SET alt = ? WHERE project_slug = ? AND src = ?`,
    [alt.trim().slice(0, 400), slug, src],
  );
  return ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

/**
 * Make an existing page the grid cover.
 *
 * This used to build a second image: it read the page back off disk, reframed
 * it to 16:9 and wrote a separate `cover.webp`. That was for a grid tile with
 * a fixed shape, and the tile no longer has one — a card now takes its ratio
 * from the cover itself, so there is nothing left to reframe.
 *
 * What the copy did leave behind was a way to be wrong. A derived file is only
 * correct until the code that derived it changes, and this one went stale
 * exactly that way: a cover built while the framing cropped to 16:9 stayed
 * cropped after the cropping was removed, because nothing re-ran. The page it
 * came from was right there on disk the whole time, unmodified.
 *
 * So the cover is a *reference* to a page now, not a copy of one. Setting it
 * is a single UPDATE — instant, exact, and impossible to leave out of date,
 * because there is no second artefact to keep in step. It also works for a
 * project still on the original file-based storage, which the old version had
 * to refuse for want of a file to read.
 */
export async function setCoverFromPage(
  slug: string,
  src: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [page] = await query<{
    src: string;
    width: number | null;
    height: number | null;
    storage: string;
  }>(`SELECT src, width, height, storage FROM project_images WHERE project_slug = ? AND src = ?`, [
    slug,
    src,
  ]);

  if (!page) return { ok: false, reason: 'That page is no longer in this deck.' };
  if (!page.width || !page.height) {
    return {
      ok: false,
      reason: 'That page has no recorded size, so the grid could not reserve space for it.',
    };
  }

  await db().execute(
    `UPDATE projects
        SET cover = ?, cover_width = ?, cover_height = ?, cover_storage = ?
      WHERE slug = ?`,
    [page.src, page.width, page.height, page.storage, slug],
  );
  return { ok: true };
}

/**
 * Reorder the projects themselves.
 *
 * `sort_order` here is a plain column with no uniqueness constraint — unlike
 * page order — so positions can be written straight out with no parking pass.
 * One transaction still, because a half-applied grid order is visible on the
 * public site immediately.
 */
export async function reorderProjects(order: string[]): Promise<number> {
  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();
    for (const [i, slug] of order.entries()) {
      await conn.execute(`UPDATE projects SET sort_order = ? WHERE slug = ?`, [i + 1, slug]);
    }
    await conn.commit();
    return order.length;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
