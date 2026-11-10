/* The scale harness's entry. The page raises the engine's load limits for itself first, outside the package's API, so
 * that the bench can load the sizes the limits refuse today: `src/engine/limits.ts` reads them at this key. */

import "./styles.css";

import { ParallaxProvider } from "@basis/parallax";
import { createRoot } from "react-dom/client";

import { Bench } from "./bench.tsx";

const mostRows = 4_294_967_295;
Reflect.set(globalThis, Symbol.for("@basis/parallax/load-limits"), {
  maxArrowBytes: Number.MAX_SAFE_INTEGER,
  maxRows: mostRows,
});

/** The package's worker, wrapped so that the bench can read the engine's WebAssembly memory. */
function startWorker(): Worker {
  return new Worker(new URL("worker.ts", import.meta.url), { name: "parallax", type: "module" });
}

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("index.html has no #root element for the harness to render into.");
}
// No StrictMode: it would open each view twice, and the bench times one.
createRoot(root).render(
  <ParallaxProvider worker={startWorker}>
    <Bench />
  </ParallaxProvider>,
);
