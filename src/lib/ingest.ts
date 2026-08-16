/**
 * Render a PDF deck to page images, in the running server.
 *
 * The same pipeline `scripts/ingest.mjs` ran at build time — pdfjs to
 * rasterise, sharp to compress — lifted out of the CLI so an upload can drive
 * it. The build version walked the filesystem for project folders; this takes
 * a buffer and returns buffers, because an HTTP upload has no folder yet and
 * nothing should touch disk until the pages have actually rendered.
 */
// Imported inside the functions, not at the top.
//
// `@napi-rs/canvas` and `sharp` are native modules that need system libraries
// present at load time. Importing them here puts them on the server's startup
// path, so a runtime missing one of those libraries kills the process before
// any of this code runs — no page, no log, no error anyone can read. Nothing
// about serving a page needs them; only rendering an upload does.

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
  const { default: sharp } = await import('sharp');
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
 * The colour to extend a cover with, taken from its own top-left pixel.
 *
 * Not the dominant colour: on artwork whose background is a shade or two off
 * its most common colour, filling with the dominant leaves a faint vertical
 * seam where the fill meets the edge. The corner pixel *is* the edge, so for
 * the usual case — a presentation page on a flat ground — the join is exact
 * and the frame simply looks wider than it is.
 */
async function edgeColour(input: Buffer): Promise<{ r: number; g: number; b: number }> {
  const { default: sharp } = await import('sharp');
  const { data } = await sharp(input)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}

/**
 * The grid cover, from page one. Always a full 1920×1080 frame.
 *
 * It used to be 16:9 for guidelines decks only; everything else kept its own
 * proportions, on the reasoning that "a logo sheet cropped to 16:9 loses the
 * mark". True of cropping — but this letterboxes, so nothing was ever at risk
 * of being cut. What actually happened is that the grid tile is 16:9 and uses
 * `object-fit: contain`, so a cover of any other shape got pillarboxed inside
 * it against the card background: a 1600×1077 logo sheet sat in a white frame
 * with bars down both sides. The card's own comment claimed covers share the
 * tile's ratio "so contain never letterboxes". This is what makes that true.
 *
 * The padding is filled with the artwork's own edge colour rather than white. A dark presentation letterboxed on white gets two bright bands the
 * designer never drew; filled with its own colour, the frame simply extends
 * and the seam is invisible. A cover that is already 16:9 is unaffected either
 * way, since there is nothing to fill.
 */
export async function makeCover(pageOne: Buffer): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  return sharp(pageOne)
    .resize({ width: 1920, height: 1080, fit: 'contain', background: await edgeColour(pageOne) })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
