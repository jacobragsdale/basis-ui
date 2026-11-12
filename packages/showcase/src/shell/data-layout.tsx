/* The layout of the pages that show parallax's grids, pivots and charts: the engine's worker, started once for all of
 * them, so that moving between them keeps a dataset another page loaded. It loads with the first such page, so the
 * pages without parallax never load it. */

import { ParallaxProvider } from "@basis/parallax";
import { Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";

function DataLayout(): ReactElement {
  return (
    <ParallaxProvider prewarm>
      <Outlet />
    </ParallaxProvider>
  );
}

export { DataLayout };
