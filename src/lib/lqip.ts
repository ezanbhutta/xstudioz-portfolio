import sharp from 'sharp';
import path from 'node:path';
import { uploadsDir } from './uploads';

/**
 * Blur placeholders: a ~200-byte, 16px-wide WebP inlined as a data URI and
 * painted behind each portfolio image. The frame shows the image's own colours
 * instantly and the full asset paints over it — no layout shift, no extra
 * request, no client JavaScript.
 *
 * This used to read `fsPath` off Astro's build-time `ImageMetadata`. Uploaded
 * images never pass through that pipeline, so it now resolves the file on disk
 * from the public path instead. The effect is identical; only the way the file
 * is located changed.
 *
 * Cached by path and shared across requests: the server is long-lived, the
 * files are immutable once written, and re-deriving a placeholder on every
 * request would spend real CPU redoing identical work.
 */
const cache = new Map<string, Promise<string | null>>();

/** `/uploads/<slug>/<file>` → the file on disk, or null if not an upload. */
function diskPath(src: string): string | null {
  const match = /^\/uploads\/([^/]+)\/([^/]+)$/.exec(src);
  if (!match) return null;
  return path.join(uploadsDir(), match[1], match[2]);
}

export function lqip(src: string): Promise<string | null> {
  const file = diskPath(src);
  if (!file) return Promise.resolve(null);

  let hit = cache.get(file);
  if (!hit) {
    hit = sharp(file)
      .resize(16)
      .webp({ quality: 30 })
      .toBuffer()
      .then((buffer) => `data:image/webp;base64,${buffer.toString('base64')}`)
      // A missing or unreadable file costs one placeholder, never the page.
      .catch(() => null);
    cache.set(file, hit);
  }
  return hit;
}

/** Inline style that paints the placeholder behind an <img>. */
export async function lqipStyle(src: string): Promise<string | undefined> {
  const uri = await lqip(src);
  return uri ? `background-image:url(${uri});background-size:cover` : undefined;
}
