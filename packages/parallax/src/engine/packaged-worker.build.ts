/* The engine's worker as the built package ships it: `worker.mjs`, beside the bundle that holds this module, which the
 * package's build puts in place of packaged-worker.ts. An app's bundler finds a worker written as
 * `new Worker(new URL(..., import.meta.url))` and bundles it with its wasm, so an app needs no `?worker` import of its
 * own; `basisPlugins()` keeps Vite's dependency optimizer away from this package, so that in `vp dev` the URL still
 * resolves beside the package's own files. */

/** Starts the packaged engine's worker. */
function packagedWorker(): Worker {
  return new Worker(new URL("worker.mjs", import.meta.url), { name: "parallax", type: "module" });
}

export { packagedWorker };
