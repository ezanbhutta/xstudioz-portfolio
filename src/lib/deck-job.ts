/**
 * Uploading a deck, one page per request.
 *
 * The whole deck used to render inside the upload request. On this host that
 * does not work: Hostinger's proxy answered a 3.2 MB deck with a 504, and a
 * retry with a 503 — the render outlived the gateway's patience, and a big
 * enough one took the process with it. No amount of tuning fixes that shape;
 * the work has to stop being one request.
 *
 * So the browser drives it. It posts the PDF once, is told how many pages
 * there are, then asks for one page at a time. Every request is short by
 * construction, whatever the deck's size, and the operator gets a real page
 * count moving rather than a bar that fills and then hangs.
 *
 * State lives on disk beside the pages, not in memory. A shared host recycles
 * processes whenever it likes, and a job held in a module variable would
 * vanish mid-deck for reasons nobody could reproduce.
 *
 * Pages are staged in a subdirectory and promoted in one step at the end. The
 * database still points at the previous deck while a new one renders, so
 * writing straight to the live filenames would corrupt what visitors see for
 * as long as the upload takes — and leave it corrupt if the upload never
 * finished.
 */
import { mkdir, writeFile, readFile, rm, readdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { uploadsDir, safeSegment, writeImage } from '@/lib/uploads';
import { renderPdfPage, trimBorder, MAX_PAGES } from '@/lib/ingest';

/** Everything for one upload lives here, and is deleted when it finishes. */
const STAGE = '_staging';

export type JobManifest = {
  /** Original filename, recorded on the project when the deck is committed. */
  filename: string;
  /** 'append' keeps the existing pages and cover; anything else replaces. */
  append: boolean;
  total: number;
  /**
   * Pages already rendered. Their written size is recorded here because the
   * page needs it to reserve space, and re-reading every file at the end to
   * recover it would be work already done once.
   */
  done: Array<{
    index: number;
    number: number;
    width: number;
    height: number;
    /** What was actually written for this page — 'avif,webp' or 'webp'. */
    formats?: string;
  }>;
  /** Where appended pages start, fixed at the beginning so it cannot drift. */
  firstNumber: number;
  /** How many pages the project had when this started. */
  existing: number;
};

const stageDir = (slug: string) => path.join(uploadsDir(), safeSegment(slug), STAGE);
const manifestPath = (slug: string) => path.join(stageDir(slug), 'manifest.json');
const sourcePath = (slug: string) => path.join(stageDir(slug), 'source.pdf');

export async function readManifest(slug: string): Promise<JobManifest | null> {
  try {
    return JSON.parse(await readFile(manifestPath(slug), 'utf8')) as JobManifest;
  } catch {
    return null;
  }
}

async function writeManifest(slug: string, manifest: JobManifest): Promise<void> {
  await writeFile(manifestPath(slug), JSON.stringify(manifest));
}

/**
 * Begin an upload: keep the PDF, count its pages, record what to do with it.
 *
 * Any previous staging directory is discarded first. A half-finished upload
 * that was abandoned is not something to resume by accident — the operator
 * chose a file just now, and that is the deck they mean.
 */
export async function startJob(
  slug: string,
  pdf: Buffer,
  filename: string,
  append: boolean,
  existing: number,
  firstNumber: number,
): Promise<{ total: number }> {
  const { countPdfPages } = await import('@/lib/ingest');
  const total = await countPdfPages(pdf);

  if (total === 0) throw new Error('That PDF has no pages.');
  if (total > MAX_PAGES) {
    throw new Error(
      `That PDF has ${total} pages; the limit is ${MAX_PAGES}. ` +
        'Split it, or upload the presentation rather than the full document.',
    );
  }

  await clearJob(slug);
  await mkdir(stageDir(slug), { recursive: true });
  await writeFile(sourcePath(slug), pdf);
  await writeManifest(slug, { filename, append, total, done: [], firstNumber, existing });
  return { total };
}

/**
 * Render one page into the staging directory.
 *
 * Returns how many pages are finished, so the browser can show progress
 * without keeping its own count — the server's tally is the one that survives
 * a reload.
 */
export async function renderJobPage(
  slug: string,
  index: number,
): Promise<{ done: number; total: number }> {
  const manifest = await readManifest(slug);
  if (!manifest) throw new Error('That upload is no longer in progress. Start it again.');
  if (index < 1 || index > manifest.total) throw new Error(`Page ${index} is not in this deck.`);

  // Already rendered — a retry after a dropped connection, not a reason to
  // spend the time again.
  if (manifest.done.some((d) => d.index === index)) {
    return { done: manifest.done.length, total: manifest.total };
  }

  const pdf = await readFile(sourcePath(slug));
  const png = await renderPdfPage(pdf, index);
  const number = manifest.firstNumber + index - 1;
  const written = await writeImage(
    await trimBorder(png),
    slug,
    `page-${String(number).padStart(2, '0')}`,
    STAGE,
  );

  // Re-read before writing: two pages rendering at once would otherwise each
  // save a tally that does not know about the other.
  const current = (await readManifest(slug)) ?? manifest;
  if (!current.done.some((d) => d.index === index)) {
    current.done.push({
      index,
      number,
      width: written.width,
      height: written.height,
      formats: written.formats,
    });
  }
  await writeManifest(slug, current);

  return { done: current.done.length, total: current.total };
}

/**
 * Move staged pages into place.
 *
 * Renames rather than copies, so it is effectively instant and cannot leave a
 * deck half-written because the request ran long. The staging directory goes
 * afterwards, taking the source PDF with it.
 */
export async function promoteJob(slug: string): Promise<void> {
  const dir = stageDir(slug);
  const target = path.join(uploadsDir(), safeSegment(slug));
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.webp')) continue; // manifest and source stay behind
    await rename(path.join(dir, name), path.join(target, name));
  }
}

export async function clearJob(slug: string): Promise<void> {
  if (existsSync(stageDir(slug))) await rm(stageDir(slug), { recursive: true, force: true });
}
