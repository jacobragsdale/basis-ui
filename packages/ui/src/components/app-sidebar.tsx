/* The app's sidebar, built from its route tree: one item for each titled page, under its group's heading, the current
 * one marked, and the user menu in its footer. A page added to the routes appears here with no change to the sidebar.
 * A page that has no item, such as a bond's at `/bonds/$security`, marks the item it lies under, `/bonds`. Each item
 * names itself in a tooltip on the folded icon rail. */

import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";

import { currentEntry, groupEntries, useRouteEntries } from "./route-entries.ts";
import type { RouteEntry } from "./route-entries.ts";
import { Sidebar, SidebarRail } from "./sidebar.tsx";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "./sidebar-group.tsx";
import { SidebarMenu, SidebarMenuItem } from "./sidebar-menu.tsx";
import { SidebarMenuButton } from "./sidebar-menu-button.tsx";
import { SidebarContent, SidebarFooter, SidebarHeader } from "./sidebar-sections.tsx";
import { UserMenu } from "./user-menu.tsx";

/** A link's active state is the sidebar's to say, by `currentEntry`, not the router's, which would mark `/` on every
 * page. */
const exactly = { exact: true, includeSearch: false } as const;

/** One group's pages, under its heading if it has one. */
function PageGroup({
  label,
  entries,
  current,
}: {
  readonly label: string | undefined;
  readonly entries: readonly RouteEntry[];
  readonly current: RouteEntry | undefined;
}): ReactElement {
  return (
    <SidebarGroup>
      {label === undefined ? null : <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {entries.map(({ id, title, to, icon: Icon }) => (
            <SidebarMenuItem key={id}>
              <SidebarMenuButton
                isActive={id === current?.id}
                tooltip={title}
                render={
                  <Link
                    to={to}
                    activeOptions={exactly}
                    aria-current={id === current?.id ? "page" : undefined}
                  />
                }
              >
                {Icon === undefined ? null : <Icon />}
                <span>{title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

interface AppSidebarProps {
  /** The app's name, at the top of the sidebar. */
  readonly appName: string;
  /** What the sidebar's header holds under the app's name, such as a choice of desk. */
  readonly header?: ReactNode;
  /** The sidebar's footer, the user menu unless set: an app that sets it and keeps the user menu puts `<UserMenu />`
   * in it. */
  readonly footer?: ReactNode;
  /** How the sidebar folds, by its trigger, its rail or Ctrl+B: `offcanvas` slides it away, `icon` folds it to a rail
   * of its pages' icons, each named by a tooltip. The user menu needs the sidebar's width, so a sidebar that folds to
   * icons takes a `footer` of SidebarMenuButtons.
   * @default "offcanvas" */
  readonly collapsible?: "offcanvas" | "icon";
}

/** The sidebar of an app's pages, from the titles and groups its routes set in `staticData`. `AppShell` holds one.
 *
 * @use AppShell holds one; use it alone only in a layout of the app's own. For a sidebar of links built by hand, use
 * SidebarMenu.
 * @see AppShell, SidebarProvider, SidebarInset, SidebarMenu, UserMenu, useRouteEntries
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
function AppSidebar({
  appName,
  header,
  footer,
  collapsible = "offcanvas",
}: AppSidebarProps): ReactElement {
  const entries = useRouteEntries();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const current = currentEntry(entries, path);
  return (
    // The sidebar is the app's complementary landmark, named by the app, so its header and footer sit in one.
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Sidebar renders shadcn's fixed container, a div; an aside round it would sit outside the fixed panel.
    <Sidebar collapsible={collapsible} role="complementary" aria-label={appName}>
      <SidebarHeader>
        <span className="truncate px-2 text-sm font-semibold">{appName}</span>
        {header}
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Pages">
          {groupEntries(entries).map(([label, grouped]) => (
            <PageGroup key={label ?? ""} label={label} entries={grouped} current={current} />
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter>{footer ?? <UserMenu />}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export { AppSidebar };
export type { AppSidebarProps };
