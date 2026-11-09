/* AppShell: the page every app's routes sit in, its root route's component. It holds the sidebar of the app's pages,
 * a header with the breadcrumbs, the environment banner, the command palette and the keyboard shortcuts with their `?`
 * list, so an app's pages hold only their own content.
 *
 * It is one column the window's height: the banner, then the sidebar and the page, which scrolls inside it. The
 * sidebar's row contains its layout, so the sidebar's fixed panel is placed in the row, below the banner, rather than
 * in the window, where it would cover the banner's left edge. */

import { Outlet } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";

import { AppSidebar } from "./app-sidebar.tsx";
import { CommandPalette } from "./command-palette.tsx";
import type { PaletteCommand } from "./command-palette.tsx";
import { EnvironmentBanner } from "./environment-banner.tsx";
import { RouteBreadcrumbs } from "./route-breadcrumbs.tsx";
import { ShortcutProvider } from "./shortcuts.tsx";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./sidebar.tsx";

interface AppShellProps {
  /** The app's name, at the top of the sidebar. */
  readonly appName: string;
  /** The environment the app runs in, which a banner names; none unless set. */
  readonly environment?: "dev" | "qa" | "prod" | undefined;
  /** Commands the palette offers beside the app's pages. */
  readonly commands?: readonly PaletteCommand[] | undefined;
  /** The page; the matched route's, through `<Outlet />`, unless set. */
  readonly children?: ReactNode;
}

/** The layout of an app's pages: the sidebar built from the routes, a header with the breadcrumbs, the environment
 * banner, Ctrl+K's command palette and `?`'s list of shortcuts. Make it the root route's component.
 *
 * @example
 * ```tsx
 * import { AppShell } from "@basis/ui";
 * import { createRootRoute } from "@tanstack/react-router";
 *
 * export const rootRoute = createRootRoute({
 *   component: () => <AppShell appName="Positions" environment="qa" />,
 * });
 * ```
 */
function AppShell({ appName, environment, commands, children }: AppShellProps): ReactElement {
  return (
    <ShortcutProvider>
      <div data-slot="app-shell" className="flex h-svh flex-col">
        {environment === undefined ? null : (
          <EnvironmentBanner environment={environment} className="shrink-0" />
        )}
        <SidebarProvider className="min-h-0 flex-1 contain-layout">
          <AppSidebar appName={appName} />
          <SidebarInset className="min-h-0 overflow-y-auto">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <RouteBreadcrumbs />
            </header>
            <main className="flex flex-1 flex-col gap-4 p-4">{children ?? <Outlet />}</main>
          </SidebarInset>
        </SidebarProvider>
      </div>
      <CommandPalette commands={commands} />
    </ShortcutProvider>
  );
}

export { AppShell };
export type { AppShellProps };
