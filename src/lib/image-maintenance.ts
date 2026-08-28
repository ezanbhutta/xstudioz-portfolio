/**
 * Bringing images already on disk up to the current ladder.
 *
 * Changing how uploads are written only changes uploads made after the change.
 * Everything already published keeps whatever rungs and formats it was born
 * with, and the only way to fix that used to be re-exporting the PDF and
 * uploading it again — for every project, every time the pipeline improved.
 *
 * That is the wrong shape. The widest WebP is still on disk, it is the same
 * image, and every narrower rung and every AVIF is derivable from it. So they
 * are derived, in place, from what is already there. No PDF, no re-upload, and
 * no risk to the row: the file the page points at is never rewritten, only
 * added beside.
 *
 * Re-encoding a WebP costs one extra lossy pass. That is the price of not
 * having the original, and it is the pessimistic case the AVIF numbers in
 * uploads.ts were measured under — 34% off the heaviest image on the site,
 * starting from an image that had already been compressed once.
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { db, query } from '@/lib/db';
import { loadSharp } from '@/lib/sharp';
import { WIDTHS, uploadsDir, safeSegment } from '@/lib/uploads';

/**
 * Has migration 003 been run?
 *
 * Everything else here is written to work either way — the reads are
 * `SELECT *` and treat a missing key as WebP — but the one write is not: an
 * UPDATE naming a column that does not exist fails, and it fails after the
 * files have already been encoded. Asked once, up front, so the answer is
 * "run the migration" rather than a SQL error halfway through a rebuild.
 */
export async function formatsColumnExists(): Promise<boolean> {
  const rows = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'project_images'
        AND COLUMN_NAME = 'formats'`,
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export type RebuildTarget = {
  slug: string;
  src: string;
  width: number;
  formats: string;
};

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

/**
 * Every uploaded image, oldest project first.
 *
 * Only `storage = 'upload'`. A row still on the original build-time assets has
 * no file under the uploads directory to derive anything from, and Astro
 * already optimises those at build.
 *
 * `SELECT *` for the same reason the portfolio read uses it: this has to work
 * against a database that has not run the formats migration yet, where it
 * finds every image needing an AVIF and says so.
 */
export async function listRebuildTargets(): Promise<RebuildTarget[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM project_images WHERE storage = 'upload' ORDER BY project_slug, sort_order`,
  );
  return rows
    .filter((r) => /^\/uploads\/[^/]+\/[^/]+\.webp$/.test(String(r.src ?? '')))
    .map((r) => ({
      slug: String(r.project_slug),
      src: String(r.src),
      width: Number(r.width) || 0,
      formats: String(r.formats ?? 'webp'),
    }));
}

export type RebuildResult = {
  src: string;
  /** Files that did not exist and now do. */
  wrote: number;
  /** True when nothing was missing — the common case on a second run. */
  alreadyDone: boolean;
  formats: string;
  /** Set when the image could not be rebuilt at all, and why. */
  skipped?: string;
};

/**
 * Derive whatever is missing beside one image, and record what it now has.
 *
 * Writes only files that are absent, so running this twice costs one `access`
 * per rung and nothing else — which matters, because the honest way to use it
 * is to run it again whenever the ladder changes and let it work out what is
 * new.
 */
export async function rebuildOne(target: RebuildTarget): Promise<RebuildResult> {
  const match = /^\/uploads\/([^/]+)\/([^/]+)\.webp$/.exec(target.src);
  if (!match)
    return {
      src: target.src,
      wrote: 0,
      alreadyDone: true,
      formats: target.formats,
      skipped: 'not an uploaded file',
    };

  const dir = path.join(uploadsDir(), safeSegment(match[1]));
  const base = safeSegment(match[2]);
  const full = path.join(dir, `${base}.webp`);

  if (!(await exists(full))) {
    return {
      src: target.src,
      wrote: 0,
      alreadyDone: false,
      formats: target.formats,
      skipped: 'the widest file is not on disk',
    };
  }

  const sharp = await loadSharp();
  const input = await readFile(full);
  const meta = await sharp(input).metadata();
  const widest = meta.width ?? target.width;
  if (!widest) {
    return {
      src: target.src,
      wrote: 0,
      alreadyDone: false,
      formats: target.formats,
      skipped: 'the file has no readable width',
    };
  }

  let wrote = 0;

  // The narrower WebP rungs. A ladder that gained a width — 1280 — has a hole
  // in the middle of it for every image written before that width existed.
  for (const w of WIDTHS) {
    if (w >= widest) continue;
    const file = path.join(dir, `${base}-${w}.webp`);
    if (await exists(file)) continue;
    await writeFile(file, await sharp(input).resize({ width: w }).webp({ quality: 78 }).toBuffer());
    wrote++;
  }

  /**
   * AVIF, all rungs or none.
   *
   * A partial ladder is the failure described in uploads.ts: a <source>
   * offering fewer widths than the <img> beside it makes a phone download a
   * wider file than it would have without the source at all. So the row is
   * only told it has AVIF once every rung is confirmed on disk.
   */
  const avifWidths = [...WIDTHS.filter((w) => w < widest), widest];
  let avifComplete = true;
  for (const w of avifWidths) {
    const file = path.join(dir, w === widest ? `${base}.avif` : `${base}-${w}.avif`);
    if (await exists(file)) continue;
    try {
      await writeFile(
        file,
        await sharp(input).resize({ width: w }).avif({ quality: 55, effort: 2 }).toBuffer(),
      );
      wrote++;
    } catch (error) {
      console.warn(`[rebuild] AVIF ${w}w failed for ${target.src}: ${(error as Error).message}`);
      avifComplete = false;
      break;
    }
  }

  const formats = avifComplete ? 'avif,webp' : 'webp';
  if (formats !== target.formats) {
    await db().execute(`UPDATE project_images SET formats = ? WHERE src = ?`, [
      formats,
      target.src,
    ]);
  }

  return { src: target.src, wrote, alreadyDone: wrote === 0, formats };
}
