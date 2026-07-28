/**
 * Removes emitted assets that no built page references. Astro copies the
 * original content-collection PNGs into dist/_astro even though every <img>
 * resolves to WebP/AVIF variants — ~0.6 MB of deploy weight nobody fetches.
 * Runs automatically after `astro build` (see package.json).
 */
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve('dist');
const ASSETS = path.join(DIST, '_astro');

async function collectFiles(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectFiles(p, out);
    else out.push(p);
  }
  return out;
}

const files = await collectFiles(DIST);
const referencing = files.filter((f) => /\.(html|css|js|xml|txt|json)$/.test(f));
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
