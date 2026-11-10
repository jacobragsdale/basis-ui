/* Every gallery test starts in the comfortable density, which its measurements are written for. The stylesheet's base
 * is the compact default, which the head script the preset puts in every page, the tests' too, names; a test that
 * measures the compact density switches to it with `inCompactDensity`, which puts the comfortable density back after. */

import { beforeEach } from "vite-plus/test";

beforeEach(() => {
  document.documentElement.dataset["density"] = "comfortable";
});
