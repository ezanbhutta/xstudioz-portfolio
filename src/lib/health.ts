/**
 * Plain-text status, always 200.
 *
 * Four deployments failed with a green build log, a red banner, and no error
 * text anywhere in the hosting panel. This page exists so the running app can
 * be asked directly instead: which variables it can see, whether it can reach
 * the database, and if not, what MySQL actually said.
 *
 * Always 200 on purpose. A health check that fails when the database is down
 * takes the whole deployment with it, which is precisely how the real error
 * stayed hidden.
 *
 * No secrets are printed — only whether each variable is set and how long it
 * is, which is enough to catch the common causes (missing, empty, or a value
 * with a stray space or quote) without exposing the value itself. It is
 * unauthenticated because the failure it diagnoses can prevent signing in.
 *
 * Served from middleware rather than as a page. The site sets
 * `trailingSlash: 'always'`, so a page here answers `/health/` and redirects
 * `/health` — and Hostinger's deployment health check requests exactly
 * `/health`, does not follow redirects, and fails the deployment on anything
 * that is not a 200. Six deployments failed on that redirect.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { query } from './db';
import { uploadsDir } from './uploads';
import { getSortedProjects, databaseError } from './content';
import { loadSharp } from './sharp';
import { loadCanvas } from './canvas';

const shown = (name: string) => {
  const value = process.env[name];
  if (value === undefined) return `${name}: MISSING`;
  if (value === '') return `${name}: EMPTY`;
  const trimmed = value.trim();
  const notes = [`${value.length} chars`];
  if (trimmed !== value) notes.push('HAS LEADING/TRAILING WHITESPACE');
  if (/^["']|["']$/.test(trimmed)) notes.push('WRAPPED IN QUOTES — remove them');
  return `${name}: set (${notes.join(', ')})`;
};

/**
 * Can this deployment actually store an upload?
 *
 * "Does the directory exist" was the wrong question, and it read as an alarm
 * on a perfectly healthy site: nothing has been uploaded yet, `writeImage`
 * creates the directory on first write, and so a fresh deployment always
 * reported failure for a thing that was going to work.
 *
 * The question worth answering is whether an upload will succeed, and the only
 * honest way to answer it is to try. This creates the directory if it is
 * missing, writes a small file, reads the size back and deletes it. That
 * distinguishes the three states that matter — ready, not writable, and
 * writable but pointing somewhere a deploy will erase — where existence
 * confused the first two.
 *
 * Creating the directory is a side effect in a status endpoint, which is
 * normally a bad idea. It is the right one here: the directory has to exist
 * eventually, making it costs nothing, and doing it now means the first real
 * upload is not also the first test of whether the path is writable at all.
 */
async function uploadsStatus(): Promise<string[]> {
  const dir = uploadsDir();
  const probe = path.join(dir, '.health-probe');

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(probe, 'ok');
    await rm(probe);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [
      '  writable: NO — uploads will fail',
      `  error:    ${message}`,
      '  fix:      point UPLOADS_DIR at a directory this process can write to,',
      '            outside the deploy target. See db/DEPLOY.md.',
    ];
  }

  // Writable, but inside the directory the host replaces on every deploy: the
  // first uploaded deck survives until the next push and then vanishes.
  const inside = dir.startsWith(process.cwd());
  return [
    '  writable: yes',
    ...(inside
      ? [
          '  WARNING:  this is inside the deployed app, so the next deploy',
          '            erases every upload. Set UPLOADS_DIR outside it.',
        ]
      : []),
  ];
}

/** How many threads this process is currently running. Linux only; null elsewhere. */
function threadCount(): number | null {
  try {
    const status = readFileSync('/proc/self/status', 'utf8');
    return Number(/^Threads:\s*(\d+)/m.exec(status)?.[1] ?? NaN) || null;
  } catch {
    return null;
  }
}

/** The account's ceiling on processes and threads, if the kernel will say. */
function processLimit(): string {
  try {
    const limits = readFileSync('/proc/self/limits', 'utf8');
    const line = /^Max processes\s+(\S+)\s+(\S+)/m.exec(limits);
    return line ? `soft ${line[1]}, hard ${line[2]}` : '(not reported)';
  } catch {
    return '(unreadable)';
  }
}

/**
 * Can this deployment render a PDF at all — and if not, why not?
 *
 * The upload pipeline needs two native modules, @napi-rs/canvas to rasterise
 * and sharp to compress, and both need system libraries present. They are
 * imported lazily precisely so a missing library cannot stop the server
 * booting, which means the first time anyone finds out is when an upload
 * fails, in production, with no way to see why from outside.
 *
 * "It loads" turned out not to be the useful question. Both modules load here
 * perfectly well and an upload still failed, because the failure happens when
 * a library asks the kernel for a thread and is refused. So this now reports
 * the numbers that decide that — cores, threads, the process ceiling, memory —
 * and then does real work at the size a deck page actually is.
 *
 * Only run on request (`/health?render=1`), never on the routine check.
 * Hostinger polls /health to decide whether the deployment is alive; if
 * loading a broken native module aborts the process, doing it here would turn
 * a diagnostic into an outage.
 */
async function rendererStatus(): Promise<string[]> {
  const out: string[] = ['', 'PDF renderer:'];

  // The numbers that decide whether an upload can work at all.
  //
  // `glib: Error creating thread: Resource temporarily unavailable` is EAGAIN
  // from pthread_create, which means one of two things: the account is at its
  // thread ceiling, or there is not enough memory left to give a new thread its
  // stack. Both are invisible from outside the box, and guessing between them
  // has already cost one release — so measure.
  //
  // The CPU count matters because every native library here sizes its thread
  // pool from it, and a shared host reports the whole machine's cores rather
  // than the slice this plan may use.
  const rss = process.memoryUsage().rss;
  out.push(
    `  cpus reported:   ${os.cpus().length}`,
    `  threads now:     ${threadCount() ?? '(unknown)'}`,
    `  max processes:   ${processLimit()}`,
    `  rss:             ${(rss / 1024 / 1024).toFixed(0)} MB`,
    '',
  );

  for (const [label, load] of [
    ['@napi-rs/canvas', () => loadCanvas()],
    ['pdfjs-dist', () => import('pdfjs-dist/legacy/build/pdf.mjs')],
    ['sharp', () => loadSharp()],
  ] as const) {
    const before = threadCount();
    try {
      await load();
      const after = threadCount();
      const grew = before !== null && after !== null ? ` (+${after - before} threads)` : '';
      out.push(`  ${label.padEnd(16)} loads${grew}`);
    } catch (error) {
      out.push(`  ${label.padEnd(16)} FAILED — ${error instanceof Error ? error.message : error}`);
    }
  }

  // Loading a library proves nothing: the failure happens when it asks the
  // kernel for a thread, which is only when real work runs. So do real work,
  // at the size a deck page actually is.
  out.push('', '  Live operations, at the size a real page uses:');

  try {
    const sharp = await loadSharp();
    out.push(`    sharp concurrency: ${sharp.concurrency()}`);
    const before = threadCount();
    const canvasSized = await sharp({
      create: { width: 1600, height: 1100, channels: 3, background: '#888888' },
    })
      .png()
      .toBuffer();
    await sharp(canvasSized).resize({ width: 1600 }).webp({ quality: 82 }).toBuffer();
    const after = threadCount();
    out.push(
      `    sharp resize+webp: OK${before !== null && after !== null ? ` (threads ${before} -> ${after})` : ''}`,
    );
  } catch (error) {
    out.push(`    sharp resize+webp: FAILED — ${error instanceof Error ? error.message : error}`);
  }

  try {
    const { createCanvas } = await loadCanvas();
    const before = threadCount();
    const canvas = createCanvas(1600, 1100);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1600, 1100);
    await canvas.encode('png');
    const after = threadCount();
    out.push(
      `    canvas render:     OK${before !== null && after !== null ? ` (threads ${before} -> ${after})` : ''}`,
    );
  } catch (error) {
    out.push(`    canvas render:     FAILED — ${error instanceof Error ? error.message : error}`);
  }

  // Read after the loaders have run, so these are the values that were actually
  // in force — the loaders set them immediately before their native import, so
  // reading them earlier reports "(unset)" and means nothing.
  out.push(
    '',
    `  threads after all of that: ${threadCount() ?? '(unknown)'}`,
    `  VIPS_CONCURRENCY:     ${process.env.VIPS_CONCURRENCY ?? '(unset)'}`,
    `  TOKIO_WORKER_THREADS: ${process.env.TOKIO_WORKER_THREADS ?? '(unset — canvas will open one thread per core)'}`,
    // The only one of the three that cannot be set from inside the process:
    // libuv sizes its pool the first time anything uses it, which is during
    // module loading, long before this code runs. It has to come from the
    // host's environment configuration or not at all.
    `  UV_THREADPOOL_SIZE:   ${process.env.UV_THREADPOOL_SIZE ?? '(unset, Node default 4)'}`,
  );
  return out;
}

export async function healthReport(url?: URL): Promise<Response> {
  const lines: string[] = [
    'XStudioz portfolio — status',
    `time: ${new Date().toISOString()}`,
    `node: ${process.version}`,
    `port: ${process.env.PORT ?? '(unset, using 3000)'}`,
    '',
    'Environment:',
    ...[
      'DB_HOST',
      'DB_PORT',
      'DB_USER',
      'DB_NAME',
      'DB_PASSWORD',
      'ADMIN_PASSWORD',
      'SESSION_SECRET',
      'UPLOADS_DIR',
    ].map((n) => `  ${shown(n)}`),
    '',
    // The resolved path, not just the variable.
    //
    // UPLOADS_DIR falls back to `path.resolve('public/uploads')`, which is
    // relative to the working directory the process was launched from — so
    // leaving it unset does not fail, it silently points somewhere inside the
    // deployed app. Every uploaded image then 404s, and the next deploy erases
    // the originals. Printing where it actually landed, and whether anything
    // is there, is the only way to see that before it costs the portfolio.
    'Uploads:',
    `  resolved: ${uploadsDir()}`,
    ...(await uploadsStatus()),
    `  cwd:      ${process.cwd()}`,
    '',
    'Database:',
  ];

  try {
    const rows = await query<{ n: number }>('SELECT COUNT(*) AS n FROM projects');
    const images = await query<{ n: number }>('SELECT COUNT(*) AS n FROM project_images');
    lines.push('  CONNECTED', `  projects: ${rows[0]?.n ?? 0}`, `  images:   ${images[0]?.n ?? 0}`);
  } catch (error) {
    const e = error as { code?: string; errno?: number; sqlMessage?: string; message?: string };
    lines.push(
      '  FAILED',
      `  code:    ${e.code ?? '(none)'}`,
      `  message: ${e.sqlMessage ?? e.message ?? String(error)}`,
      '',
      // The three that actually happen, in the order they are worth checking.
      '  ER_ACCESS_DENIED_ERROR → wrong DB_USER or DB_PASSWORD',
      '  ER_BAD_DB_ERROR        → DB_NAME does not exist (check the capital X)',
      '  ECONNREFUSED           → nothing listening on DB_HOST:DB_PORT',
    );
  }

  /**
   * What the site will actually render, not just what the tables contain.
   *
   * Counting rows says the database is reachable; it does not say a single
   * project will appear. `getSortedProjects` drops any project whose cover or
   * images fail to resolve, and it logs the reason to a console nobody reads.
   * A portfolio can therefore report CONNECTED with 8 projects and 228 images
   * and still render an empty grid — which is exactly what happened here.
   *
   * This runs the real read path and reports the gap between the two numbers,
   * so "the database is fine" and "the site is fine" stop being the same
   * sentence.
   */
  lines.push('', 'Rendered:');
  try {
    const projects = await getSortedProjects();
    lines.push(`  displayable: ${projects.length}`);
    if (projects.length === 0) {
      lines.push(
        '  NONE — every project was dropped before render.',
        `  last query error: ${databaseError() ?? '(none — so this is image resolution, not SQL)'}`,
        '  A project is dropped when its cover or its images fail to resolve.',
        "  storage='upload' needs src, width and height on the row;",
        "  storage='asset' needs a file matching src under src/content/projects/<slug>/.",
      );
    } else {
      for (const p of projects) {
        lines.push(`    ${p.id}: ${p.data.images.length} image(s)`);
      }
    }
  } catch (error) {
    lines.push(`  FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
  // Opt-in: /health?render=1
  if (url?.searchParams.get('render') !== null && url?.searchParams.get('render') !== undefined) {
    lines.push(...(await rendererStatus()));
  }

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
