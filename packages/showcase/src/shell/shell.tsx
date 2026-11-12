/* The showcase's shell: AppShell, whose user menu holds the theme, mode, density and motion, with a palette command
 * and a shortcut that show the performance overlay as a tool. The overlay loads only when first shown. */

import { AppShell, GaugeIcon } from "@basis/ui";
import type { PaletteCommand } from "@basis/ui";
import { lazy, Suspense, useState } from "react";
import type { ReactElement } from "react";

const PerformanceOverlay = lazy(async () => {
  const { PerformanceOverlay: overlay } = await import("@basis/parallax");
  return { default: overlay };
});

function Shell(): ReactElement {
  const [overlay, setOverlay] = useState(false);
  const commands: readonly PaletteCommand[] = [
    {
      group: "Tools",
      icon: GaugeIcon,
      id: "performance",
      keywords: ["frame time", "memory", "timing", "citrix"],
      label: overlay ? "Hide the performance overlay" : "Show the performance overlay",
      run: () => {
        setOverlay((shown) => !shown);
      },
      shortcut: "mod+shift+p",
    },
  ];
  return (
    <>
      <AppShell appName="Workbench" collapsible="icon" commands={commands} environment="dev" />
      {overlay ? (
        <Suspense>
          <PerformanceOverlay />
        </Suspense>
      ) : null}
    </>
  );
}

export { Shell };
