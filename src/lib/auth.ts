/**
 * Admin authentication.
 *
 * The admin edits the live site with no review step and no undo, so it sits
 * behind a password on a signed, HTTP-only cookie. This is deliberately small:
 * one operator, one password, no user table, no password reset, no third-party
 * identity provider. Every one of those would be more code and more attack
 * surface protecting a portfolio site with a single editor.
 *
 * What it does do is refuse to run insecurely. A missing or weak
 * ADMIN_PASSWORD stops the admin from working at all rather than defaulting to
 * something guessable, because the failure mode of a guessable admin password
 * is a stranger rewriting the portfolio.
 */
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const COOKIE = 'xs_admin';
/** Long enough that re-authenticating is rare, short enough that a stolen
 *  laptop is not a standing invitation. */
const MAX_AGE_SECONDS = 60 * 60 * 12;
const MIN_PASSWORD_LENGTH = 12;

export type AuthConfig = { password: string; secret: string };

/**
 * Read and validate the admin secrets.
 *
 * Throws rather than returning a default. An admin panel that silently falls
 * back to a known password is worse than one that refuses to load, because
 * only one of those two states is obvious to the person who deployed it.
 */
export function authConfig(): AuthConfig {
  const password = process.env.ADMIN_PASSWORD ?? '';
  const secret = process.env.SESSION_SECRET ?? '';

  if (!password || !secret) {
    throw new Error(
      'Admin is not configured. Set ADMIN_PASSWORD and SESSION_SECRET in ' +
        'hPanel → Environment variables (or .env locally). See db/DEPLOY.md.',
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters. ` +
        'This password is the only thing between the public internet and ' +
        'rewriting the live site.',
    );
  }
  if (secret.length < 32) {
    throw new Error(
      'SESSION_SECRET must be at least 32 characters. A short secret can be ' +
        'brute-forced, which lets an attacker forge a valid admin session.',
    );
  }
  return { password, secret };
}

/** Constant-time compare, so a wrong password cannot be found byte by byte. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length. Compare a fixed-size digest of each instead.
  const digest = (buf: Buffer) => createHmac('sha256', 'compare').update(buf).digest();
  return timingSafeEqual(digest(bufA), digest(bufB));
}

/** `<expiry>.<hmac>` — the signature covers the expiry, so it cannot be extended. */
function sign(expiresAt: number, secret: string): string {
  const mac = createHmac('sha256', secret).update(String(expiresAt)).digest('hex');
  return `${expiresAt}.${mac}`;
}

function verify(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const [expiry, mac] = token.split('.');
  if (!expiry || !mac) return false;
  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = createHmac('sha256', secret).update(expiry).digest('hex');
  return safeEqual(mac, expected);
}

export function checkPassword(submitted: string): boolean {
  return safeEqual(submitted, authConfig().password);
}

/** The Set-Cookie value for a fresh session. */
export function sessionCookie(): { name: string; value: string; options: Record<string, unknown> } {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  return {
    name: COOKIE,
    value: sign(expiresAt, authConfig().secret),
    options: {
      httpOnly: true, // unreachable from JavaScript, so an XSS cannot steal it
      secure: true, // HTTPS only
      sameSite: 'lax' as const, // a cross-site POST cannot ride the session
      path: '/',
      maxAge: MAX_AGE_SECONDS,
    },
  };
}

export const clearedCookie = {
  name: COOKIE,
  value: '',
  options: { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 0 },
};

/** Is this request signed in? */
export function isSignedIn(cookieValue: string | undefined): boolean {
  try {
    return verify(cookieValue, authConfig().secret);
  } catch {
    // Unconfigured means nobody is signed in, which is the safe answer.
    return false;
  }
}

export const COOKIE_NAME = COOKIE;

/** A suggestion for the operator, printed by `npm run admin-secret`. */
export const suggestSecret = () => randomBytes(32).toString('hex');
