import sharp from 'sharp';
import type { ImageMetadata } from 'astro';

/**
 * Build-time blur placeholders: a ~200-byte, 16px-wide WebP inlined as a
 * data URI and painted behind each portfolio image. The frame shows the
 * image's own colors instantly and the full asset paints over it —
 * zero layout shift, zero requests, zero client JavaScript.
 */
const cache = new Map<string, Promise<string | null>>();

export function lqip(image: ImageMetadata): Promise<string | null> {
  const fsPath = (image as ImageMetadata & { fsPath?: string }).fsPath;
  if (!fsPath) return Promise.resolve(null);
  let hit = cache.get(fsPath);
  if (!hit) {
    hit = sharp(fsPath)
      .resize(16)
      .webp({ quality: 30 })
      .toBuffer()
      .then((buffer) => `data:image/webp;base64,${buffer.toString('base64')}`)
      .catch(() => null);
    cache.set(fsPath, hit);
  }
  return hit;
}

/** Inline style that paints the placeholder behind an <img>. */
export async function lqipStyle(image: ImageMetadata): Promise<string | undefined> {
  const uri = await lqip(image);
  return uri ? `background-image:url(${uri});background-size:cover` : undefined;
}
