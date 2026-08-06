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
 */
import type { APIRoute } from 'astro';
import { query } from '@/lib/db';

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

export const GET: APIRoute = async () => {
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
    ].map((n) => `  ${shown(n)}`),
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

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
};
