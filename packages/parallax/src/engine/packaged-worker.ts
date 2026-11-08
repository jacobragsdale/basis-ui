/* The engine's worker, as ParallaxProvider starts it when given none. Run from its source, as this repo's harnesses and
 * tests run it, the package has no built worker beside it, so it asks for one; the package's build replaces this module
 * with packaged-worker.build.ts (vite.config.ts), which starts the worker shipped beside the bundle. */

/** Fails: the package's source has no built worker, so a page that runs it passes ParallaxProvider its own. */
function packagedWorker(): Worker {
  throw new Error(
    "ERROR @basis/parallax runs from its source here, which has no built worker beside it: pass ParallaxProvider a worker, as the harnesses do, or use the built package.",
  );
}

export { packagedWorker };
