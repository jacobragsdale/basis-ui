/* The demo's tools, in the sidebar's footer, where AppShell would put the user menu: the theme, mode and density, and
 * the performance overlay. Each is a menu button, so the folded icon rail shows its icon and names it in a tooltip. */

import { GaugeIcon, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@basis/ui";
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
    </SidebarMenu>
  );
}

export { ToolButtons };
