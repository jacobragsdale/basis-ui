/* The app's sidebar, built from its route tree: one item for each titled page, the current one marked, and the user
 * menu in its footer. A page added to the routes appears here with no change to the sidebar. */

import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { useRouteEntries } from "./route-entries.ts";
import { Sidebar } from "./sidebar.tsx";
import { SidebarGroup, SidebarGroupContent } from "./sidebar-group.tsx";
import { SidebarMenu, SidebarMenuItem } from "./sidebar-menu.tsx";
import { SidebarMenuButton } from "./sidebar-menu-button.tsx";
import { SidebarContent, SidebarFooter, SidebarHeader } from "./sidebar-sections.tsx";
import { UserMenu } from "./user-menu.tsx";

/** The sidebar of an app's pages, from the titles its routes set in `staticData`. `AppShell` holds one.
 *
 * @example
 * ```tsx
 * import { AppSidebar, SidebarInset, SidebarProvider } from "@basis/ui";
 *
 * <SidebarProvider>
 *   <AppSidebar appName="Positions" />
 *   <SidebarInset>Page</SidebarInset>
 * </SidebarProvider>;
 * ```
 */
function AppSidebar({ appName }: { readonly appName: string }): ReactElement {
  const entries = useRouteEntries();
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <Sidebar>
      <SidebarHeader>
        <span className="px-2 text-sm font-semibold">{appName}</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {entries.map(({ id, title, to, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton isActive={path === to} render={<Link to={to} />}>
                    {Icon === undefined ? null : <Icon />}
                    {title}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}

export { AppSidebar };
