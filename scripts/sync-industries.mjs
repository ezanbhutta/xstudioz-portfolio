/**
 * Rebuilds the Industry dropdown options in public/admin/config.yml from
 * every industry saved in the index.json of each project folder under
 * src/content/projects — both the `industry` select and the free-text
 * `industryNew` escape hatch.
 *
 * Runs before `astro build` (see package.json), and every CMS save triggers
 * a deploy — so an industry typed into "New industry" today is a dropdown
 * option for the next project automatically. The block between the
 * `# industries:begin` / `# industries:end` markers is generated; edits
 * inside it are overwritten.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PROJECTS_DIR = 'src/content/projects';
const CONFIG = 'public/admin/config.yml';
const BEGIN = '# industries:begin';
const END = '# industries:end';

const industries = new Map(); // lowercased → first-seen casing

for (const dir of (await readdir(PROJECTS_DIR, { withFileTypes: true })).filter((d) =>
  d.isDirectory(),
)) {
  let data;
  try {
    data = JSON.parse(await readFile(join(PROJECTS_DIR, dir.name, 'index.json'), 'utf8'));
  } catch {
    continue; // a folder without readable metadata never breaks the build
  }
  for (const raw of [data.industry, data.industryNew]) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value && !industries.has(value.toLowerCase())) {
      industries.set(value.toLowerCase(), value);
    }
  }
}

const sorted = [...industries.values()].sort((a, b) => a.localeCompare(b));

const config = await readFile(CONFIG, 'utf8');
const lines = config.split('\n');
const beginAt = lines.findIndex((l) => l.trim() === BEGIN);
const endAt = lines.findIndex((l) => l.trim() === END);
if (beginAt === -1 || endAt === -1 || endAt < beginAt) {
  throw new Error(`Markers "${BEGIN}" / "${END}" not found in ${CONFIG}`);
}

const indent = lines[beginAt].slice(0, lines[beginAt].indexOf('#'));
const block =
  sorted.length === 0
    ? [`${indent}options: []`]
    : [`${indent}options:`, ...sorted.map((v) => `${indent}  - ${JSON.stringify(v)}`)];

const next = [...lines.slice(0, beginAt + 1), ...block, ...lines.slice(endAt)].join('\n');
if (next !== config) {
  await writeFile(CONFIG, next);
  console.log(`sync-industries: ${sorted.length} industries → ${CONFIG}`);
} else {
  console.log(`sync-industries: ${sorted.length} industries, already in sync`);
}
