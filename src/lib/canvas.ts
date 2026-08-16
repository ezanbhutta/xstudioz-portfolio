/**
 * @napi-rs/canvas, with its thread pool capped before it starts.
 *
 * Loading this module cost **64 threads** on the production host. Not
 * rendering anything — loading it. `/health?render=1` measured the whole
 * sequence:
 *
 *     cpus reported:   64
 *     @napi-rs/canvas  loads (+64 threads)
 *     threads after all of that: 78
 *
 * The box reports 64 cores because it is a shared machine and that is the
 * whole machine, not the slice this plan may use. napi-rs starts a tokio
 * runtime when the native module initialises and sizes its worker pool from
 * that count, so the app opened 64 threads to rasterise pages two at a time.
 * The account's ceiling is shared with everything else running under the same
 * user, and once it is reached the kernel refuses the next thread with EAGAIN
 * — which surfaces from libvips as `glib: Error creating thread: Resource
 * temporarily unavailable` and failed every deck upload.
 *
 * TOKIO_WORKER_THREADS is read when that runtime is built, so setting it here,
 * immediately before the import, is enough — measured at +1 thread instead of
 * +4 on a 4-core machine, in-process, which is exactly this code path. It is
 * only possible because the import is lazy.
 *
 * Two rather than one: a canvas encode is asynchronous, and a single worker
 * serialises two overlapping admin requests behind each other for no real
 * saving. Two is still sixty-two fewer than before.
 *
 * RAYON_NUM_THREADS was tried first and is not set here, because it made no
 * difference at all — measured, +4 with and without. Leaving it in would have
 * looked like a fix.
 *
 * The import is also lazy for a second reason: this needs system libraries
 * present at load time, and a top-level import would put that on the server's
 * startup path, where a missing library kills the process before it can serve
 * a single page or log a single line.
 */
const WORKERS = '2';

let loading: Promise<typeof import('@napi-rs/canvas')> | null = null;

export function loadCanvas(): Promise<typeof import('@napi-rs/canvas')> {
  loading ??= (async () => {
    process.env.TOKIO_WORKER_THREADS ??= WORKERS;
    return import('@napi-rs/canvas');
  })();
  return loading;
}
