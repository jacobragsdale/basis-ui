/* The layout every page sits in: parallax's engine in its worker, started with the app, the demo's datasets in it,
 * and AppShell, which gives the demo its sidebar of pages in their groups, folding to an icon rail, the breadcrumbs,
 * Ctrl+K's command palette and ?'s list of shortcuts. The sidebar's footer holds the demo's tools in the user menu's
 * place, and the palette opens them too; the tools open over the page. */

import { ParallaxProvider } from "@basis/parallax";
import { AppShell, GaugeIcon } from "@basis/ui";
import type { PaletteCommand } from "@basis/ui";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { PerformanceOverlay } from "#tools/performance.tsx";

import { DemoDatasets } from "./demo-datasets.tsx";
import { ToolButtons } from "./tool-buttons.tsx";
import { ToolsContext } from "./tools.ts";
import type { Tools } from "./tools.ts";

/** The palette's commands for the tools. */
function toolCommands(tools: Tools): readonly PaletteCommand[] {
  return [
    {
      group: "Tools",
      icon: GaugeIcon,
      id: "performance",
      keywords: ["frame time", "memory", "timing"],
      label: tools.performance ? "Hide the performance overlay" : "Show the performance overlay",
      run: tools.handlePerformance,
    },
  ];
}

function Layout(): ReactNode {
  const [performance, setPerformance] = useState(false);
  const tools: Tools = useMemo(
    () => ({
      handlePerformance: () => {
        setPerformance((shown) => !shown);
      },
      performance,
    }),
    [performance],
  );
  return (
    <ParallaxProvider prewarm>
      <DemoDatasets>
        <ToolsContext value={tools}>
          <AppShell
            appName="parallax"
            collapsible="icon"
            commands={toolCommands(tools)}
            sidebarFooter={<ToolButtons />}
          />
          {performance ? <PerformanceOverlay /> : null}
        </ToolsContext>
      </DemoDatasets>
    </ParallaxProvider>
  );
}

export { Layout };
