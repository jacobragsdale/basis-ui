/* The demo's tools, in the sidebar's footer, where AppShell would put the user menu: the mode and density, the
 * performance overlay and the theme studio. Each is a menu button, so the folded icon rail shows its icon and names it
 * in a tooltip. */

import { GaugeIcon, PaletteIcon, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@basis/ui";
import type { ReactNode } from "react";

import { AppearanceMenu } from "./appearance.tsx";
import { useTools } from "./tools.ts";

/** The footer's tools. */
function ToolButtons(): ReactNode {
  const tools = useTools();
  return (
    <SidebarMenu>
      <AppearanceMenu />
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-pressed={tools.performance}
          isActive={tools.performance}
          tooltip="Performance"
          onClick={tools.handlePerformance}
        >
          <GaugeIcon />
          <span>Performance</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-pressed={tools.studio}
          isActive={tools.studio}
          tooltip="Theme studio"
          onClick={() => {
            tools.handleStudio(!tools.studio);
          }}
        >
          <PaletteIcon />
          <span>Theme studio</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export { ToolButtons };
