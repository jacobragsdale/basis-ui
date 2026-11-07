/* The demo's sidebar: its pages, in their groups, and its tools in the footer, the mode and density, the performance
 * overlay and the theme studio. It folds to its icon rail with its trigger, its rail or Ctrl+B. */

import {
  GaugeIcon,
  PaletteIcon,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@basis/ui";
import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppearanceMenu } from "./appearance.tsx";
import { pageList } from "./pages.ts";
import type { PageGroup } from "./pages.ts";
import { useTools } from "./tools.ts";

const groups: readonly PageGroup[] = ["Tables", "Charts"];

/** One group's pages, each a link, the current one marked. */
function PageLinks({
  group,
  current,
}: {
  readonly group: PageGroup;
  readonly current: string;
}): ReactNode {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{group}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {pageList
            .filter((page) => page.group === group)
            .map(({ path, title, Icon }) => (
              <SidebarMenuItem key={path}>
                <SidebarMenuButton
                  isActive={path === current}
                  tooltip={title}
                  render={
                    <Link to={path} aria-current={path === current ? "page" : undefined}>
                      <Icon />
                      <span>{title}</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

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

function DemoSidebar(): ReactNode {
  const current = useLocation({ select: (location) => location.pathname });
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <p className="truncate px-2 py-1 text-sm font-semibold">parallax</p>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Pages">
          {groups.map((group) => (
            <PageLinks key={group} group={group} current={current} />
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <ToolButtons />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export { DemoSidebar };
