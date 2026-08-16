/**
 * Ingests real portfolio assets into project folders.
 *
 * Each brand's portfolio arrives as ONE asset. Drop it into
 * src/content/projects/<slug>/ using one of these conventions:
 *
 *   portfolio.pdf          → every page (any size, any dimensions) is
 *                            rendered to page-NN.png at 1600px wide and a
 *                            grid cover is generated from page 1.
 *
 *   sheet.png|jpg|jpeg|webp → the single (usually tall) presentation image
 *                            becomes the whole portfolio and its own
 *                            grid cover.
 *
 * Then run:  npm run ingest
 *
 * index.json is created if missing (edit title/category/summary after)
 * and updated in place if present — your copy fields are preserved, only
 * cover/images are rewritten. Re-running is safe and idempotent.
 */
import { readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const PROJECTS_ROOT = path.resolve('src/content/projects');
const PAGE_WIDTH = 1600;
const SHEET_NAMES = ['sheet.png', 'sheet.jpg', 'sheet.jpeg', 'sheet.webp'];

const titleFromSlug = (slug) =>
  slug
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

/** Renders every PDF page to a PNG at PAGE_WIDTH; returns the filenames. */
async function renderPdf(pdfPath, dir) {
  const data = new Uint8Array(await readFile(pdfPath));
  const loadingTask = getDocument({ data, isEvalSupported: false });
  const doc = await loadingTask.promise;
  const names = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PAGE_WIDTH / base.width });
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // PDF pages may be transparent
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const name = `page-${String(n).padStart(2, '0')}.png`;
    const png = await canvas.encode('png');
    // Re-compress through sharp for a smaller, palette-friendly master.
    await sharp(await trimBorder(png))
      .png({ compressionLevel: 9 })
      .toFile(path.join(dir, name));
    names.push(name);
  }
  await loadingTask.destroy();
  return names;
}

/** Remove a uniform exported border. Guarded: anything removing more than a
 *  sixth of a dimension is not a margin, so the original is kept. Must stay in
 *  step with trimBorder in src/lib/ingest.ts. */
async function trimBorder(buf) {
  const before = await sharp(buf).metadata();
  if (!before.width || !before.height) return buf;
  try {
    const out = await sharp(buf).trim({ threshold: 1 }).toBuffer();
    const after = await sharp(out).metadata();
    if (!after.width || !after.height) return buf;
    if (1 - after.width / before.width > 1 / 6) return buf;
    if (1 - after.height / before.height > 1 / 6) return buf;
    return out;
  } catch {
    return buf;
  }
}

/** The colour to extend a cover with — its own top-left pixel, so the join is
 *  exact. The dominant colour leaves a faint seam when the background is a
 *  shade off the most common colour in the artwork. */
async function edgeColour(sourcePath) {
  const { data } = await sharp(sourcePath)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}

/**
 * Grid cover. Always a full 1920×1080 frame, nothing cropped, any shortfall
 * filled with the artwork's own edge colour so the seam is invisible.
 *
 * Must stay in step with `makeCover` in src/lib/ingest.ts, which does the same
 * job for decks uploaded through the admin. The duplication is because this is
 * a plain .mjs build script and that is TypeScript; if one changes and the
 * other does not, an uploaded cover and an ingested cover come out different
 * shapes and the grid goes ragged.
 */
async function makeCover(sourcePath, dir) {
  const out = path.join(dir, 'cover.png');
  await sharp(sourcePath)
    .resize({ width: 1920, height: 1080, fit: 'contain', background: await edgeColour(sourcePath) })
    .png({ compressionLevel: 9 })
    .toFile(out);
}

async function readMeta(dir, slug) {
  const metaPath = path.join(dir, 'index.json');
  if (existsSync(metaPath)) return JSON.parse(await readFile(metaPath, 'utf8'));
  console.warn(`  ! ${slug}/index.json created — set category and summary before building.`);
  return {
    title: titleFromSlug(slug),
    category: 'logo-design',
    order: 99,
    summary: `EDIT ME: one sentence about the ${titleFromSlug(slug)} project.`,
  };
}

async function ingestProject(slug) {
  const dir = path.join(PROJECTS_ROOT, slug);
  const metaPath = path.join(dir, 'index.json');
  const existingMeta = existsSync(metaPath) ? JSON.parse(await readFile(metaPath, 'utf8')) : null;

  // The CMS stores an uploaded PDF's filename in the `pdf` field; the
  // portfolio.pdf convention still works for manual drops.
  const cmsPdf = existingMeta?.pdf ? existingMeta.pdf.replace(/^\.\//, '') : null;
  const pdfName =
    cmsPdf && existsSync(path.join(dir, cmsPdf))
      ? cmsPdf
      : existsSync(path.join(dir, 'portfolio.pdf'))
        ? 'portfolio.pdf'
        : null;
  const pdfPath = pdfName ? path.join(dir, pdfName) : path.join(dir, 'portfolio.pdf');
  const sheetName = SHEET_NAMES.find((n) => existsSync(path.join(dir, n)));

  if (!pdfName && !sheetName) return false;

  const meta = existingMeta ?? (await readMeta(dir, slug));
  const title = meta.title ?? titleFromSlug(slug);

  if (pdfName) {
    // Clear stale renders so removed pages don't linger.
    for (const f of await readdir(dir)) {
      if (/^page-\d+\.png$/.test(f)) await rm(path.join(dir, f));
    }
    const pages = await renderPdf(pdfPath, dir);
    await makeCover(path.join(dir, pages[0]), dir);
    meta.cover = './cover.png';
    meta.coverAlt = meta.coverAlt || `${title} presentation cover`;
    meta.images = pages.map((name, i) => ({
      src: `./${name}`,
      alt: `${title} presentation, page ${i + 1} of ${pages.length}`,
    }));
    delete meta.download;
    console.log(`✓ ${slug} — ${pages.length} PDF pages rendered`);
  } else {
    await makeCover(path.join(dir, sheetName), dir);
    meta.cover = './cover.png';
    meta.coverAlt = meta.coverAlt || `${title} presentation cover`;
    meta.images = [{ src: `./${sheetName}`, alt: `${title} — full portfolio presentation` }];
    delete meta.download;
    console.log(`✓ ${slug} — single-sheet portfolio ingested`);
  }

  await writeFile(path.join(dir, 'index.json'), JSON.stringify(meta, null, 2) + '\n');
  return true;
}

const slugs = (await readdir(PROJECTS_ROOT, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let count = 0;
for (const slug of slugs) {
  if (await ingestProject(slug)) count += 1;
}
console.log(
  count === 0
    ? 'Nothing to ingest — add portfolio.pdf or sheet.png to a project folder first.'
    : `\nIngested ${count} project(s). Review each index.json, then npm run build.`,
);
