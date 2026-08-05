/**
 * Render a PDF deck to page images, in the running server.
 *
 * The same pipeline `scripts/ingest.mjs` ran at build time — pdfjs to
 * rasterise, sharp to compress — lifted out of the CLI so an upload can drive
 * it. The build version walked the filesystem for project folders; this takes
 * a buffer and returns buffers, because an HTTP upload has no folder yet and
 * nothing should touch disk until the pages have actually rendered.
 */
import sharp from 'sharp';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Matches the build: wide enough for a 2× retina read at display size. */
const PAGE_WIDTH = 1600;

/**
 * A deck this long is a mistake, not a portfolio.
 *
 * Rendering is CPU-bound and this runs on a 2-core shared plan, so an
 * accidental 500-page upload would peg the box and stall every visitor. The
 * longest real deck here is 45 pages.
 */
export const MAX_PAGES = 120;

export type RenderedPage = { index: number; png: Buffer };

/**
 * Rasterise every page. Yields one buffer per page, in order.
 *
 * Pages are rendered one at a time on purpose. Rendering in parallel would be
 * faster and would also hold every page of a 45-page deck in memory at once —
 * which is what exhausted the builder on this project before.
 */
export async function renderPdf(data: Buffer): Promise<RenderedPage[]> {
  const task = getDocument({
    data: new Uint8Array(data),
    // A PDF is an untrusted upload. Never let it execute anything.
    //
    // `isEvalSupported` is honoured at runtime but missing from this version's
    // DocumentInitParameters, so the cast is to satisfy the types, not to
    // bypass a real check — dropping the option would re-enable eval.
    isEvalSupported: false,
  } as Parameters<typeof getDocument>[0]);
  const doc = await task.promise;

  try {
    if (doc.numPages > MAX_PAGES) {
      throw new Error(
        `That PDF has ${doc.numPages} pages; the limit is ${MAX_PAGES}. ` +
          'Split it, or upload the presentation rather than the full document.',
      );
    }

    const pages: RenderedPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PAGE_WIDTH / base.width });
      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      // PDF pages may be transparent; without this they composite onto black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // @napi-rs/canvas implements the 2D context pdfjs needs but is typed as
      // its own SKRSContext2D, which lacks the browser-only drawFocusIfNeeded.
      // pdfjs never calls it; scripts/ingest.mjs has rendered every deck in
      // this portfolio through exactly this pairing.
      await page.render({
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        canvas: canvas as unknown as HTMLCanvasElement,
        viewport,
      }).promise;
      pages.push({ index: n, png: await canvas.encode('png') });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/**
 * The grid cover, from page one.
 *
 * Guidelines decks are letterboxed to a full 1920×1080 frame so the grid reads
 * as a row of presentations rather than a ragged mix of shapes. Everything
 * else keeps its own proportions — a logo sheet cropped to 16:9 loses the mark.
 */
export async function makeCover(pageOne: Buffer, category: string): Promise<Buffer> {
  const image = sharp(pageOne);
  if (category === 'brand-guidelines') {
    return image
      .resize({ width: 1920, height: 1080, fit: 'contain', background: '#ffffff' })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }
  return image.resize({ width: PAGE_WIDTH }).png({ compressionLevel: 9 }).toBuffer();
}
