/**
 * Sign out.
 *
 * POST only. A GET would let any page log the operator out with an <img> tag,
 * and would let a prefetcher do it by accident.
 */
import type { APIRoute } from 'astro';
import { clearedCookie } from '@/lib/auth';

export const POST: APIRoute = ({ cookies, redirect, url }) => {
  // Flags must match the ones the session was set with, or the browser
  // treats it as a different cookie and quietly keeps the old one.
  const cookie = clearedCookie(url);
  cookies.set(cookie.name, cookie.value, cookie.options);
  return redirect('/admin/login/', 303);
};
