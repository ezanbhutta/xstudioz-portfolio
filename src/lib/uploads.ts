/**
 * Uploaded images: where they live, and how they are made.
 *
 * These files are written while the server is running, so they cannot live in
 * the app directory — Hostinger replaces that wholesale on every deploy, and a
 * redeploy would erase the portfolio. They go in `public_html/uploads/`, which
 * sits outside the deploy target and survives.
 *
 * They also cannot go through Astro's image pipeline, which resolves at build
 * time and simply ignores anything that appears later. So the responsive WebP
 * that the build used to emit is generated here instead, once, at upload.
 * Visitors get the same three widths either way; only the moment of
 * generation moved.
 */
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
// sharp comes through src/lib/sharp.ts, which loads it lazily and pins its
// thread pool to one — a shared plan caps threads per account, and libvips
// sized to the CPU count is what makes an upload fail with a glib error.
import { loadSharp } from '@/lib/sharp';

/**
 * The widths the case study and the grid actually request.
 *
 * 1280 was the missing rung. A brand guidelines page is portrait — around
 * 1540×2200 — and the case study asks for `92vw` of it on a phone. At 3x that
 * is a shade over 1000 CSS pixels of image, so the browser skipped 1024 and
 * took the full-width file: 445 KB where 216 KB would have been
 * indistinguishable. The gap between 1024 and 1600 was exactly where phones
 * landed.
 */
export const WIDTHS = [640, 1024, 1280, 1600] as const;

/**
 * AVIF beside every WebP.
 *
 * Measured on the two heaviest images the site actually serves, re-encoded
 * from the WebP already on disk — so this is the pessimistic number, with one
 * lossy pass already spent:
 *
 *   repartu page 1     445 KB webp  →  295 KB avif   (-34%)
 *   parallelstudio 1   148 KB webp  →   87 KB avif   (-41%)
 *
 * `effort: 2` is the whole reason this is affordable. At effort 4 the same
 * image takes 13 seconds instead of 1.7 for about 10% more compression, and
 * this host has already proved it will refuse work when asked for too much at
 * once.
 *
 * Quality 55 rather than the 50 that measured smaller: a judgement, not a
 * measurement. Large flats of a single brand colour are what AVIF gives up
 * first, and banding across a logo lockup is the one artefact a portfolio of
 * identity work cannot ship. 55 keeps a margin; it can come down later with
 * an eye on the actual pages.
 *
 * Best-effort, never required. A failure here writes no AVIF and records none,
 * and the page is served exactly as it is today — the alternative is an upload
 * that fails outright over an optimisation.
 */
const AVIF = { quality: 55, effort: 2 } as const;

/**
 * Where uploads are written.
 *
 * Configurable because the correct answer differs by environment and getting
 * it wrong is expensive: in production this must point outside the deployed
 * app, and locally it has to be somewhere the dev server can serve.
 */
export function uploadsDir(): string {
  return process.env.UPLOADS_DIR ?? path.resolve('public/uploads');
}

/** The URL a browser requests. Always POSIX separators — this is a URL. */
export const publicPath = (slug: string, file: string) => `/uploads/${slug}/${file}`;

/** Reject anything that could climb out of the uploads directory. */
export function safeSegment(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9._-]/g, '');
  if (clean === '' || clean === '.' || clean === '..') {
    throw new Error(`Unsafe path segment: ${JSON.stringify(value)}`);
  }
  return clean;
}

export type WrittenImage = {
  src: string;
  width: number;
  height: number;
  /**
   * Which formats were actually written, widest first in preference order —
   * 'avif,webp' or 'webp'. Recorded rather than assumed: a <source> pointing
   * at an AVIF that was never written is a broken image, and a browser does
   * not fall back from a <source> that 404s.
   */
  formats: string;
};

/**
 * Write one image and its narrower variants.
 *
 * The widest file keeps the plain name and is what `src` points at, so a
 * browser that ignores srcset still gets a working image. The variants are
 * suffixed and only ever reached through srcset.
 *
 * Returns the intrinsic size of the full-width file, which the page needs to
 * reserve space before the image loads — without it a thirty-six page deck
 * shoves itself down the screen thirty-six times.
 */
export async function writeImage(
  input: Buffer,
  slug: string,
  basename: string,
  /**
   * Optional subdirectory under the project.
   *
   * A deck being rendered page by page cannot write to the live filenames:
   * the database still points at the previous deck, and overwriting
   * `page-01.webp` would corrupt what visitors are looking at right up until
   * the moment the new deck is committed. Pages are staged in a subdirectory
   * and promoted in one step when every page has rendered.
   */
  subdir?: string,
): Promise<WrittenImage> {
  const safeSlug = safeSegment(slug);
  const safeBase = safeSegment(basename);
  const safeSub = subdir ? safeSegment(subdir) : '';
  const sharp = await loadSharp();
  const dir = safeSub
    ? path.join(uploadsDir(), safeSlug, safeSub)
    : path.join(uploadsDir(), safeSlug);
  await mkdir(dir, { recursive: true });

  const image = sharp(input, { limitInputPixels: 268402689 });
  const meta = await image.metadata();
  const sourceWidth = meta.width ?? WIDTHS[WIDTHS.length - 1];

  // Never upscale. Enlarging a 900px source to 1600 costs bytes and adds no
  // detail — it just makes a soft image bigger.
  const widest = Math.min(sourceWidth, WIDTHS[WIDTHS.length - 1]);
  // The written size comes back with the buffer rather than from a second pass
  // over it. Every sharp pipeline asks the kernel for threads, and on this host
  // that request is what fails — so the avoidable ones are worth avoiding.
  const { data: full, info: fullMeta } = await sharp(input)
    .resize({ width: widest })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  await writeFile(path.join(dir, `${safeBase}.webp`), full);

  for (const w of WIDTHS) {
    if (w >= widest) continue;
    const variant = await sharp(input).resize({ width: w }).webp({ quality: 78 }).toBuffer();
    await writeFile(path.join(dir, `${safeBase}-${w}.webp`), variant);
  }

  const avif = await writeAvif(input, dir, safeBase, widest);

  return {
    src: publicPath(safeSub ? `${safeSlug}/${safeSub}` : safeSlug, `${safeBase}.webp`),
    width: fullMeta.width ?? widest,
    height: fullMeta.height ?? 0,
    formats: avif ? 'avif,webp' : 'webp',
  };
}

/**
 * The AVIF rungs, beside the WebP ones and matching them width for width.
 *
 * Matching matters. A <source> with a shorter ladder than the <img> beside it
 * makes a phone pick a 1024-wide AVIF where it would have taken a 640-wide
 * WebP — a smaller file in a better format, replaced by a bigger one. Either
 * every rung exists in both, or the AVIF source is not offered at all.
 *
 * Returns false rather than throwing. Every caller treats AVIF as an
 * enhancement and records what was actually written, so a host that refuses
 * the extra work serves the site exactly as it does today.
 */
export async function writeAvif(
  input: Buffer,
  dir: string,
  basename: string,
  widest: number,
): Promise<boolean> {
  const sharp = await loadSharp();
  const written: string[] = [];
  try {
    for (const w of WIDTHS) {
      if (w >= widest) continue;
      const file = path.join(dir, `${basename}-${w}.avif`);
      await writeFile(file, await sharp(input).resize({ width: w }).avif(AVIF).toBuffer());
      written.push(file);
    }
    const file = path.join(dir, `${basename}.avif`);
    await writeFile(file, await sharp(input).resize({ width: widest }).avif(AVIF).toBuffer());
    written.push(file);
    return true;
  } catch (error) {
    console.warn(`[uploads] AVIF skipped for ${basename}: ${(error as Error).message}`);
    // A half-written ladder is worse than none: it is exactly the mismatch
    // described above, and nothing records that it happened.
    await Promise.all(written.map((f) => rm(f).catch(() => {})));
    return false;
  }
}

/**
 * The srcset for an uploaded image, derived from its own path.
 *
 * Only lists variants narrower than the image itself, because `writeImage`
 * only wrote those — advertising a width that returns 404 would leave the
 * browser with no image at all at that breakpoint.
 */
export function srcsetFor(src: string, width: number, ext: 'webp' | 'avif' = 'webp'): string {
  const base = src.replace(/\.webp$/, '');
  const entries = WIDTHS.filter((w) => w < width).map((w) => `${base}-${w}.${ext} ${w}w`);
  entries.push(`${base}.${ext} ${width}w`);
  return entries.join(', ');
}

/** Read an uploaded file for serving. Returns null rather than throwing. */
export async function readUpload(slug: string, file: string): Promise<Buffer | null> {
  try {
    const full = path.join(uploadsDir(), safeSegment(slug), safeSegment(file));
    // Belt and braces: even with both segments sanitised, confirm the resolved
    // path is still inside the uploads directory before reading it.
    if (!full.startsWith(path.resolve(uploadsDir()) + path.sep)) return null;
    if (!existsSync(full)) return null;
    return await readFile(full);
  } catch {
    return null;
  }
}

/**
 * Delete an uploaded image and every variant `writeImage` wrote beside it.
 *
 * Takes the public `src` rather than a basename because that is what the
 * database stores and what the admin hands back when a page is removed.
 *
 * Missing files are not an error. A half-written upload, a manual tidy-up, or
 * a second delete of the same page all end in the state the caller wanted, and
 * failing the request because the bytes were already gone would leave the row
 * in the database — the one outcome worse than an orphaned file.
 */
export async function removeImage(src: string): Promise<void> {
  const match = /^\/uploads\/([^/]+)\/([^/]+)\.webp$/.exec(src);
  if (!match) return; // Not an uploaded file — a seeded asset, nothing to remove.

  const dir = path.join(uploadsDir(), safeSegment(match[1]));
  const base = safeSegment(match[2]);
  const names = (['webp', 'avif'] as const).flatMap((ext) => [
    `${base}.${ext}`,
    ...WIDTHS.map((w) => `${base}-${w}.${ext}`),
  ]);

  await Promise.all(
    names.map(async (name) => {
      try {
        await rm(path.join(dir, name));
      } catch {
        // Already gone.
      }
    }),
  );
}
