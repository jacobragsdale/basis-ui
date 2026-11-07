/* The layout every page sits in: parallax's engine in its worker, started with the app, the demo's datasets in it, the
 * sidebar beside the page, and the tools the sidebar opens over it. */

import { ParallaxProvider } from "@basis/parallax";
// oxlint-disable-next-line import/default -- `?worker` is Vite's worker import, whose default export, the worker's constructor, Vite makes; the module the resolver finds has none.
import ParallaxWorker from "@basis/parallax/worker?worker";
import { SidebarInset, SidebarProvider } from "@basis/ui";
import { Outlet } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { PerformanceOverlay } from "#tools/performance.tsx";
import { ThemeStudio } from "#tools/theme-studio.tsx";

import { DemoDatasets } from "./demo-datasets.tsx";
import { DemoSidebar } from "./sidebar.tsx";
import { ToolsContext } from "./tools.ts";
import type { Tools } from "./tools.ts";

/** Starts the engine's worker, which Vite bundles with the engine beside it. */
function startParallax(): Worker {
  return new ParallaxWorker();
}

function Layout(): ReactNode {
  const [performance, setPerformance] = useState(false);
  const [studio, setStudio] = useState(false);
  const tools: Tools = useMemo(
    () => ({
      handlePerformance: () => {
        setPerformance((shown) => !shown);
      },
      handleStudio: setStudio,
      performance,
      studio,
    }),
    [performance, studio],
  );
  return (
    <ParallaxProvider worker={startParallax} prewarm>
      <DemoDatasets>
        <ToolsContext value={tools}>
          <SidebarProvider className="h-svh min-h-0">
            <DemoSidebar />
            <SidebarInset className="min-w-0">
              <Outlet />
            </SidebarInset>
          </SidebarProvider>
          {performance ? <PerformanceOverlay /> : null}
          <ThemeStudio />
        </ToolsContext>
      </DemoDatasets>
    </ParallaxProvider>
  );
}

export { Layout };
