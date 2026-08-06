/**
 * Sign out.
 *
 * POST only. A GET would let any page log the operator out with an <img> tag,
 * and would let a prefetcher do it by accident.
 */
import type { APIRoute } from 'astro';
import { clearedCookie } from '@/lib/auth';

export const POST: APIRoute = ({ cookies, redirect }) => {
  cookies.set(clearedCookie.name, clearedCookie.value, clearedCookie.options);
  return redirect('/admin/login/', 303);
};
