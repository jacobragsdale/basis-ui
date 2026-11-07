/* The end-to-end harness: the React chart's pages, which the Playwright specs beside it drive. `?page=` picks the
 * page (`charts`, `technical`, `breakdowns` or `fixed-income`), `?theme=` the mode (`light` or `dark`), and `?look=angular` draws in
 * parallax's standard theme with the Angular layer's chart colours, for the pixel comparison with its screenshots. */

import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ParallaxProvider } from "#index.ts";

import { lookOf } from "./looks.ts";
import { Page } from "./page.tsx";

/** Starts the engine's real worker, from the package's source. */
function startParallax(): Worker {
  return new Worker(new URL("../../../../../src/worker.ts", import.meta.url), {
    name: "parallax",
    type: "module",
  });
}

const search = new URLSearchParams(globalThis.location.search);
const scheme = search.get("theme") === "dark" ? "dark" : "light";
// @basis/ui's mode is the `dark` class on the root, as its preferences set it.
document.documentElement.classList.toggle("dark", scheme === "dark");

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("The harness's index.html has no #root element.");
}
createRoot(root).render(
  <StrictMode>
    <ParallaxProvider worker={startParallax} prewarm theme={lookOf(search)} scheme={scheme}>
      <Page name={search.get("page")} />
    </ParallaxProvider>
  </StrictMode>,
);
