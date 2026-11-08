/* The engine's worker as the built package ships it: `worker.mjs`, beside the bundle that holds this module. An app's
 * bundler finds a worker written as `new Worker(new URL(..., import.meta.url))` and bundles it with its wasm, so an app
 * needs no `?worker` import of its own. `basisPlugins()` keeps Vite's dependency optimizer away from this package, so
 * that in `vp dev` the URL still resolves beside the package's own files. */

/** Starts the packaged engine's worker. The package's own tests, which run its source, pass a worker of their own. */
function packagedWorker(): Worker {
  return new Worker(new URL("worker.mjs", import.meta.url), { name: "parallax", type: "module" });
}

export { packagedWorker };
