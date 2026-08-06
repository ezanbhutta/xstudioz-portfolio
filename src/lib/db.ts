/**
 * The MySQL connection.
 *
 * On Hostinger the Node process and MySQL share a machine, so this connects
 * over `localhost` and port 3306 never opens to the internet. That is the
 * whole reason the app runs on the same account as the database rather than
 * anywhere else: no Remote MySQL, no `%` wildcard, no password standing alone
 * against the open web.
 *
 * Credentials come from the environment — hPanel → Environment variables in
 * production, `.env` locally. They are never committed and never hardcoded.
 */
import mysql from 'mysql2/promise';

/**
 * A pool, not a connection.
 *
 * Every request that renders a page runs a query, so opening and closing a
 * connection per request would spend more time on handshakes than on work.
 * The pool holds a small number open and hands them out; `connectionLimit`
 * stays low because shared hosting caps concurrent connections per user and
 * exhausting that cap takes down the site, not just one request.
 */
let pool: mysql.Pool | undefined;

export function db(): mysql.Pool {
  if (pool) return pool;

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  // Fail loudly at the first query rather than silently rendering an empty
  // site. A portfolio with no projects looks like a design decision; a
  // stack trace in the runtime log names the actual problem.
  if (!DB_NAME || !DB_USER) {
    throw new Error(
      'Database is not configured. Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD ' +
        'and DB_NAME — in hPanel → Environment variables on Hostinger, or in ' +
        '.env locally. See db/README.md.',
    );
  }

  pool = mysql.createPool({
    host: DB_HOST || 'localhost',
    port: Number(DB_PORT) || 3306,
    user: DB_USER,
    password: DB_PASSWORD ?? '',
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    // Unbounded is the wrong default on shared hosting: a stall would queue
    // requests until memory ran out. Better to reject fast and log it.
    queueLimit: 30,
    charset: 'utf8mb4',
    // Deck pages are ordered by an integer; without this mysql2 hands back
    // BIGINT columns as strings and the sort silently becomes lexicographic.
    supportBigNumbers: true,
  });

  return pool;
}

/**
 * A SELECT returning rows, typed by the caller.
 *
 * Parameters are bound, never interpolated — `execute` sends them separately
 * from the statement, so a value can never be read as SQL. Every query in the
 * app goes through here for that reason.
 */
export type Param = string | number | boolean | null | Date | Buffer;

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: Param[] = [],
): Promise<T[]> {
  const [rows] = await db().execute(sql, params);
  return rows as T[];
}

/**
 * Parse a JSON column.
 *
 * MySQL returns a parsed object for a real JSON column, MariaDB returns the
 * string it stored — the same schema behaves differently across the two, and
 * local development runs on one while production runs on the other. Accept
 * both, and never throw: a malformed value should cost one empty list, not
 * the whole page.
 */
export function jsonList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Parse an optional JSON object column, e.g. a testimonial. */
export function jsonObject<T = Record<string, unknown>>(value: unknown): T | undefined {
  if (value && typeof value === 'object') return value as T;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as T) : undefined;
  } catch {
    return undefined;
  }
}

/** '' and NULL both mean "not set" for a text column the site treats as optional. */
export const opt = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};
