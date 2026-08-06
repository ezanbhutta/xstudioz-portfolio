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
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
// sharp is imported inside writeImage: it is a native module, and keeping it
// off the server's startup path means a runtime that cannot load it still
// serves every page instead of failing to boot.

/** The widths the case study and the grid actually request. */
export const WIDTHS = [640, 1024, 1600] as const;

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

export type WrittenImage = { src: string; width: number; height: number };

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
): Promise<WrittenImage> {
  const safeSlug = safeSegment(slug);
  const safeBase = safeSegment(basename);
  const { default: sharp } = await import('sharp');
  const dir = path.join(uploadsDir(), safeSlug);
  await mkdir(dir, { recursive: true });

  const image = sharp(input, { limitInputPixels: 268402689 });
  const meta = await image.metadata();
  const sourceWidth = meta.width ?? WIDTHS[WIDTHS.length - 1];

  // Never upscale. Enlarging a 900px source to 1600 costs bytes and adds no
  // detail — it just makes a soft image bigger.
  const widest = Math.min(sourceWidth, WIDTHS[WIDTHS.length - 1]);
  const full = await sharp(input).resize({ width: widest }).webp({ quality: 82 }).toBuffer();
  const fullMeta = await sharp(full).metadata();
  await writeFile(path.join(dir, `${safeBase}.webp`), full);

  for (const w of WIDTHS) {
    if (w >= widest) continue;
    const variant = await sharp(input).resize({ width: w }).webp({ quality: 78 }).toBuffer();
    await writeFile(path.join(dir, `${safeBase}-${w}.webp`), variant);
  }

  return {
    src: publicPath(safeSlug, `${safeBase}.webp`),
    width: fullMeta.width ?? widest,
    height: fullMeta.height ?? 0,
  };
}

/**
 * The srcset for an uploaded image, derived from its own path.
 *
 * Only lists variants narrower than the image itself, because `writeImage`
 * only wrote those — advertising a width that returns 404 would leave the
 * browser with no image at all at that breakpoint.
 */
export function srcsetFor(src: string, width: number): string {
  const base = src.replace(/\.webp$/, '');
  const entries = WIDTHS.filter((w) => w < width).map((w) => `${base}-${w}.webp ${w}w`);
  entries.push(`${src} ${width}w`);
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
