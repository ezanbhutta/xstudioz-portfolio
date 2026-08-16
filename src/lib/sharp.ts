/**
 * sharp, loaded once and told to be a quiet neighbour.
 *
 * libvips — sharp's engine — opens a thread pool sized to the machine's CPU
 * count for every operation, and its own operation cache holds file handles
 * open afterwards. On a dedicated box that is exactly what you want. On a
 * shared plan it is how an upload dies: the account has a hard cap on threads,
 * and rasterising a page while resizing three variants of the last one crosses
 * it. What comes back is `glib: Error creating thread: Resource temporarily
 * unavailable`, which reads like a bug in the app and is really the host
 * saying no.
 *
 * So concurrency is pinned to one. The work here is a handful of resizes of a
 * single page, already sequential, on a two-core plan — there was never much
 * parallelism to lose, and a page that renders slightly slower beats a deck
 * that cannot be uploaded.
 *
 * The import stays lazy. sharp is a native module, and keeping it off the
 * server's startup path means a runtime that cannot load it still serves every
 * page instead of failing to boot.
 */
import type sharpModule from 'sharp';

type Sharp = typeof sharpModule;

let loading: Promise<Sharp> | null = null;

export function loadSharp(): Promise<Sharp> {
  loading ??= import('sharp').then(({ default: sharp }) => {
    // One thread per operation instead of one per core.
    sharp.concurrency(1);
    // Keep the operation cache from holding file descriptors open between
    // requests. Uploads write far more files than they re-read, so the cache
    // buys nothing here and costs handles the account is also capped on.
    sharp.cache({ files: 0 });
    return sharp;
  });
  return loading;
}
