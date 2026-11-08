/* Every gallery test starts in the comfortable density, the stylesheet's base, which its measurements are written
 * for. The head script the preset puts in every page, the tests' too, sets the compact default; a test that measures
 * the compact density switches to it with `inCompactDensity`, which puts the comfortable density back after. */

import { beforeEach } from "vite-plus/test";

beforeEach(() => {
  delete document.documentElement.dataset["density"];
});
