/**
 * @napi-rs/canvas, with its thread pool capped before it starts.
 *
 * Skia sizes its worker pool from the CPU count, and a shared host reports the
 * whole machine's cores rather than the slice this plan may use — so simply
 * loading it costs one thread per core the app will never get to use. Every
 * one of those is charged against an account ceiling that rendering a page
 * then cannot get under, which is what answers sharp with `glib: Error
 * creating thread: Resource temporarily unavailable`.
 *
 * RAYON_NUM_THREADS is read when the native module initialises, so it has to
 * be set before the import — which is only possible because the import is
 * lazy. It is lazy for a second reason too: this needs system libraries
 * present at load time, and a top-level import would put that on the server's
 * startup path, where a missing library kills the process before it can serve
 * a single page or log a single line.
 */
let loading: Promise<typeof import('@napi-rs/canvas')> | null = null;

export function loadCanvas(): Promise<typeof import('@napi-rs/canvas')> {
  loading ??= (async () => {
    process.env.RAYON_NUM_THREADS ??= '1';
    return import('@napi-rs/canvas');
  })();
  return loading;
}
