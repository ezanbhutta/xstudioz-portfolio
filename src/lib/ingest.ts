/**
 * Render a PDF deck to page images, in the running server.
 *
 * The same pipeline `scripts/ingest.mjs` ran at build time — pdfjs to
 * rasterise, sharp to compress — lifted out of the CLI so an upload can drive
 * it. The build version walked the filesystem for project folders; this takes
 * a buffer and returns buffers, because an HTTP upload has no folder yet and
 * nothing should touch disk until the pages have actually rendered.
 */
// `@napi-rs/canvas` is imported inside the functions, not at the top.
//
// It is a native module that needs system libraries present at load time.
// Importing it here puts it on the server's startup path, so a runtime missing
// one of those libraries kills the process before any of this code runs — no
// page, no log, no error anyone can read. Nothing about serving a page needs
// it; only rendering an upload does. sharp is the same, which is why it comes
// through the lazy loader below rather than a top-level import.
import { loadSharp } from '@/lib/sharp';

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
  const [{ createCanvas }, { getDocument }] = await Promise.all([
    import('@napi-rs/canvas'),
    import('pdfjs-dist/legacy/build/pdf.mjs'),
  ]);
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
 * How many pages, without rendering any of them.
 *
 * Opening a document and reading numPages is cheap; rasterising is not. The
 * upload needs the count up front so the browser knows how many render
 * requests to make, and asking for it must not cost the time the whole
 * problem is about.
 */
export async function countPdfPages(data: Buffer): Promise<number> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
  } as Parameters<typeof getDocument>[0]);
  const doc = await task.promise;
  try {
    return doc.numPages;
  } finally {
    await task.destroy();
  }
}

/**
 * Rasterise one page.
 *
 * The whole-deck version renders every page in a single call, which is what
 * put the work inside one HTTP request and made a large deck impossible to
 * upload — the host's proxy gave up with a 504, and a big enough deck took the
 * process down for a 503. One page per request keeps every request short.
 *
 * The document is reopened per page rather than held between requests. That is
 * genuinely wasted parsing, and it is the right trade: a shared host recycles
 * processes whenever it likes, so anything kept in memory between two requests
 * is a deck that fails halfway through for reasons nobody can reproduce.
 */
export async function renderPdfPage(data: Buffer, index: number): Promise<Buffer> {
  const [{ createCanvas }, { getDocument }] = await Promise.all([
    import('@napi-rs/canvas'),
    import('pdfjs-dist/legacy/build/pdf.mjs'),
  ]);
  const task = getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
  } as Parameters<typeof getDocument>[0]);
  const doc = await task.promise;

  try {
    if (index < 1 || index > doc.numPages) {
      throw new Error(`Page ${index} is outside this PDF's ${doc.numPages} pages.`);
    }
    const page = await doc.getPage(index);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PAGE_WIDTH / base.width });
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    // PDF pages may be transparent; without this they composite onto black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport,
    }).promise;
    const png = await canvas.encode('png');
    page.cleanup();
    return png;
  } finally {
    await task.destroy();
  }
}

/**
 * Remove a uniform border the artwork was exported with.
 *
 * A page exported from a design tool often carries a margin of flat colour
 * around the artboard. On the case study that reads as dead space the studio
 * did not draw, and on the grid it compounds with the letterbox padding.
 *
 * Guarded, because trimming is destructive and `trim` is a heuristic: it walks
 * in from the edges while the colour matches the corner, so a page whose
 * artwork genuinely reaches a flat expanse — a full-bleed colour field, a
 * white sheet with a small mark — can be trimmed to almost nothing. Anything
 * that would remove more than a sixth of either dimension is not a margin, and
 * the original is kept instead.
 *
 * The threshold is deliberately tight. A looser one eats anti-aliased edges
 * and shaves a pixel off the artwork itself.
 */
const MAX_TRIM = 1 / 6;

export async function trimBorder(input: Buffer): Promise<Buffer> {
  const sharp = await loadSharp();
  const before = await sharp(input).metadata();
  if (!before.width || !before.height) return input;

  try {
    const out = await sharp(input).trim({ threshold: 1 }).toBuffer();
    const after = await sharp(out).metadata();
    if (!after.width || !after.height) return input;

    const lostW = 1 - after.width / before.width;
    const lostH = 1 - after.height / before.height;
    if (lostW > MAX_TRIM || lostH > MAX_TRIM) return input;
    return out;
  } catch {
    // A page that cannot be trimmed is a page that keeps its border. Never a
    // reason to fail an upload.
    return input;
  }
}

/**
 * The grid cover, from page one: a full 1920×1080 frame, filled.
 *
 * This has now been all three things it could be, and the reasoning matters
 * because the obvious answer is wrong twice over.
 *
 * It began as "keep the page's own proportions", which put a 1600×1077 logo
 * sheet inside a 16:9 tile and left the card's background showing down both
 * sides. Then it letterboxed to 16:9 in the artwork's own edge colour, which
 * made the bars match the artwork instead of the card — but a 3:2 board still
 * arrived with 9.5% of flat colour on the left and right and 2% on the top,
 * and a frame that lopsided reads as a mistake however well the colour joins.
 *
 * So it fills. The page is scaled until it covers the frame and the overflow
 * is cropped from the centre. For the four decks already exported at 16:9 that
 * is a no-op. For a 3:2 board it costs about a sixth of the height, which is
 * real: a crop can clip the top of a mockup or the foot of a type specimen.
 *
 * That cost is acceptable here specifically because the cover is a thumbnail
 * and nothing else. The page it came from is published untouched as page one
 * of the case study, so a visitor who is interested sees the whole board a
 * click later. Cropping the thumbnail loses a glimpse; padding it loses the
 * grid.
 *
 * The border trim runs first so the crop spends its budget on the artwork's
 * dead margin before it starts eating the artwork. On an uploaded deck the
 * page has already been trimmed and this finds nothing left to take, which is
 * exactly right — it is here for the covers rebuilt from pages that predate
 * the trim.
 */
export async function makeCover(pageOne: Buffer): Promise<Buffer> {
  const sharp = await loadSharp();
  return sharp(await trimBorder(pageOne))
    .resize({ width: 1920, height: 1080, fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
