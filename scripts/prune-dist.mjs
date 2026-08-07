/**
 * Removes emitted assets that no built page references. Astro copies the
 * original content-collection PNGs into dist/_astro even though every <img>
 * resolves to WebP/AVIF variants — ~0.6 MB of deploy weight nobody fetches.
 * Runs automatically after `astro build` (see package.json).
 */
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
/**
 * `dist/client/_astro` under SSR, `dist/_astro` under a static build.
 *
 * This looked at `dist/_astro` unconditionally, which stopped existing the
 * moment the site moved to `output: 'server'` — so the script has been
 * reporting "pruned 0" on every deploy while shipping the full 31 MB of
 * source PNGs it was written to delete. A no-op that prints a success line is
 * worse than no script at all, because the number looks like a measurement.
 */
const ASSETS = existsSync(path.join(DIST, 'client', '_astro'))
  ? path.join(DIST, 'client', '_astro')
  : path.join(DIST, '_astro');

async function collectFiles(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectFiles(p, out);
    else out.push(p);
  }
  return out;
}

const files = await collectFiles(DIST);
// `.mjs` as well as `.js`.
//
// Under SSR most image references are not in any emitted HTML — there is no
// emitted HTML. They live in the server chunks, which are all `.mjs`, and
// `\.js$` does not match `foo.mjs`. Scanning only the static output would
// therefore delete the header logo and every other asset the renderer reaches
// for at request time, and the site would build clean and serve broken images.
const referencing = files.filter((f) => /\.(html|css|m?js|xml|txt|json)$/.test(f));
let corpus = '';
for (const f of referencing) corpus += await readFile(f, 'utf8');

let removed = 0;
let bytes = 0;
for (const f of files) {
  if (!f.startsWith(ASSETS) || !f.endsWith('.png')) continue;
  if (!corpus.includes(path.basename(f))) {
    bytes += (await stat(f)).size;
    await rm(f);
    removed += 1;
  }
}
console.log(`pruned ${removed} unreferenced asset(s), ${(bytes / 1024).toFixed(0)} KiB`);
