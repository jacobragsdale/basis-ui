/* The layout every page sits in: parallax's engine in its worker, started with the app, the demo's datasets in it, the
 * sidebar beside the page, and the tools the sidebar opens over it. */

import { ParallaxProvider } from "@basis/parallax";
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
    <ParallaxProvider prewarm>
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
