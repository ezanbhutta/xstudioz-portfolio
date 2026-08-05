/**
 * Move the existing projects' images out of the repo and into uploads.
 *
 *   node --env-file=.env scripts/migrate-images.mjs [--dry-run] [--slug=<slug>]
 *
 * Until this runs, the eight original projects render through Astro's build
 * glob and anything uploaded afterwards renders as a plain file — two paths
 * doing the same job, one of which cannot be edited without a deploy. This
 * collapses them onto the second.
 *
 * It also takes 62 MB of PNG out of git. Git keeps every version of every
 * binary forever, so each new deck was adding ~8 MB permanently to a clone
 * that already carried 39 MB of history.
 *
 * Safe to re-run: each image is rewritten and each row updated in place.
 * Nothing is deleted from the repo — that is a separate, deliberate step once
 * the migrated site has been verified.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { writeImage } from '../src/lib/uploads.ts';

const DRY = process.argv.includes('--dry-run');
const ONLY = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1];
const ASSETS = path.resolve('src/content/projects');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
});

/** './page-01.png' → the file on disk in the project's folder. */
const assetPath = (slug, src) => path.join(ASSETS, slug, src.replace(/^\.\//, ''));

/** 'page-01.png' → 'page-01', the basename writeImage wants. */
const baseOf = (src) => path.basename(src).replace(/\.[^.]+$/, '');

let converted = 0;
let missing = 0;
let skipped = 0;

async function migrateOne(slug) {
  const [[project]] = await pool.query(
    `SELECT slug, cover, cover_storage FROM projects WHERE slug = ?`,
    [slug],
  );
  if (!project) return;

  // Cover
  if (project.cover && project.cover_storage === 'asset') {
    const file = assetPath(slug, project.cover);
    if (existsSync(file)) {
      if (!DRY) {
        const out = await writeImage(await readFile(file), slug, baseOf(project.cover));
        await pool.query(
          `UPDATE projects
              SET cover = ?, cover_width = ?, cover_height = ?, cover_storage = 'upload'
            WHERE slug = ?`,
          [out.src, out.width, out.height, slug],
        );
      }
      converted += 1;
    } else {
      console.warn(`  ! ${slug}: cover missing on disk (${project.cover})`);
      missing += 1;
    }
  } else {
    skipped += 1;
  }

  // Deck pages
  const [images] = await pool.query(
    `SELECT sort_order, src, storage FROM project_images
      WHERE project_slug = ? ORDER BY sort_order ASC`,
    [slug],
  );

  for (const image of images) {
    if (image.storage === 'upload') {
      skipped += 1;
      continue;
    }
    const file = assetPath(slug, image.src);
    if (!existsSync(file)) {
      console.warn(`  ! ${slug}: page missing on disk (${image.src})`);
      missing += 1;
      continue;
    }
    if (!DRY) {
      const out = await writeImage(await readFile(file), slug, baseOf(image.src));
      await pool.query(
        `UPDATE project_images
            SET src = ?, width = ?, height = ?, storage = 'upload'
          WHERE project_slug = ? AND sort_order = ?`,
        [out.src, out.width, out.height, slug, image.sort_order],
      );
    }
    converted += 1;
  }

  console.log(`✓ ${slug} — ${images.length} page(s)${DRY ? ' (dry run)' : ''}`);
}

const [rows] = ONLY
  ? [[{ slug: ONLY }]]
  : await pool.query(`SELECT slug FROM projects ORDER BY sort_order`);

console.log(
  `${DRY ? 'Dry run: would migrate' : 'Migrating'} ${rows.length} project(s) ` +
    `into ${process.env.UPLOADS_DIR ?? 'public/uploads'}\n`,
);

for (const { slug } of rows) await migrateOne(slug);

console.log(
  `\n${DRY ? 'Would convert' : 'Converted'} ${converted} image(s). ` +
    `${skipped} already done, ${missing} missing on disk.`,
);
if (missing > 0) {
  console.warn(
    'Missing files leave their rows pointing at assets. Those projects still ' +
      'render from the build until the files are restored and this is re-run.',
  );
}

await pool.end();
