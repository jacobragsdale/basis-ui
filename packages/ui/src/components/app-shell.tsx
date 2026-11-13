/* AppShell: the page every app's routes sit in, its root route's component. It holds the sidebar of the app's pages,
 * a header with the breadcrumbs, the environment banner, the command palette and the keyboard shortcuts with their `?`
 * list, so an app's pages hold only their own content, each in a Page. It keeps the browser's tab titled by the page
 * shown and the app (document-title.ts).
 *
 * It is one column the window's height: the banner, then the sidebar and the page, which scrolls inside it. The
 * sidebar's row contains its layout, so the sidebar's fixed panel is placed in the row, below the banner, rather than
 * in the window, where it would cover the banner's left edge. A Page takes the whole of the space below the header and
 * scrolls, or fills it, itself; any other content scrolls in the shell's padded column, as it did before Page. The page
 * shown sits in a ShortcutScope named by its title, so the shortcuts its components declare are its own: they win over
 * the app's, and go when it does.
 *
 * One TooltipProvider holds every tooltip in the shell to one delay, `tooltipDelay`: after one opens, its neighbours
 * open at once, as the sidebar's icon rail needs, and a pointer passing over a toolbar opens none. */

import { Outlet, useMatches } from "@tanstack/react-router";
import { use, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { AppSidebar } from "./app-sidebar.tsx";
import { CommandPalette } from "./command-palette.tsx";
import type { PaletteCommand } from "./command-palette.tsx";
import { useDocumentTitle } from "./document-title.ts";
import { EnvironmentBanner } from "./environment-banner.tsx";
import { PageCrumbContext } from "./page-crumb.ts";
import type { PageCrumb } from "./page-crumb.ts";
import { RouteBreadcrumbs } from "./route-breadcrumbs.tsx";
import { ShortcutProvider, ShortcutScope } from "./shortcuts.tsx";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./sidebar.tsx";
import { TooltipProvider } from "./tooltip.tsx";

/** How long the pointer rests on a trigger before the first tooltip opens, in milliseconds. */
const tooltipDelay = 400;

interface AppShellProps {
  /** The app's name, at the top of the sidebar and in the browser's tab, after the page's title. */
  readonly appName: string;
  /** The environment the app runs in, which a banner names; none unless set. */
  readonly environment?: "dev" | "qa" | "prod" | undefined;
  /** Commands the palette offers beside the app's pages, each with its label, keywords, group, icon and shortcut. */
  readonly commands?: readonly PaletteCommand[] | undefined;
  /** What the header holds at its end, after the breadcrumbs, such as the data's as-of date or a search. */
  readonly header?: ReactNode;
  /** What the sidebar's header holds under the app's name, such as a choice of desk. */
  readonly sidebarHeader?: ReactNode;
  /** The sidebar's footer, the user menu unless set: an app that sets it and keeps the user menu puts `<UserMenu />`
   * in it. */
  readonly sidebarFooter?: ReactNode;
  /** How the sidebar folds: `offcanvas` slides it away, `icon` folds it to a rail of its pages' icons. The user menu
   * needs the sidebar's width, so an app that folds to icons gives `sidebarFooter` SidebarMenuButtons of its own.
   * @default "offcanvas" */
  readonly collapsible?: "offcanvas" | "icon";
  /** The page; the matched route's, through `<Outlet />`, unless set. */
  readonly children?: ReactNode;
}

/** The page shown's shortcuts' scope: its Page's breadcrumb, else its route's title, else "This page". */
function PageShortcuts({
  crumb,
  children,
}: {
  readonly crumb: string | undefined;
  readonly children: ReactNode;
}): ReactElement {
  const title = useMatches({ select: (matches) => matches.at(-1)?.staticData.title });
  return <ShortcutScope name={crumb ?? title ?? "This page"}>{children}</ShortcutScope>;
}

/** The page beside the sidebar: the header with the sidebar's trigger, the breadcrumbs and the header's slot, and the
 * page, in its shortcuts' scope. */
function ShellPage({ header, children }: Pick<AppShellProps, "header" | "children">): ReactElement {
  const pageCrumb = use(PageCrumbContext);
  return (
    <SidebarInset render={<div />} className="min-h-0 min-w-0 overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <RouteBreadcrumbs />
        {header === undefined ? null : (
          <div data-slot="app-shell-header" className="ml-auto flex min-w-0 items-center gap-2">
            {header}
          </div>
        )}
      </header>
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 *:shrink-0 has-data-[slot=page]:overflow-hidden has-data-[slot=page]:p-0">
        <PageShortcuts crumb={pageCrumb?.crumb}>{children ?? <Outlet />}</PageShortcuts>
      </main>
    </SidebarInset>
  );
}

/** The page's breadcrumb, which a Page sets and RouteBreadcrumbs shows. */
function usePageCrumbState(): PageCrumb {
  const [crumb, setCrumb] = useState<string | undefined>();
  return useMemo(() => ({ crumb, setCrumb }), [crumb]);
}

/** The layout of an app's pages: the sidebar built from the routes, in their groups, a header with the breadcrumbs,
 * the environment banner, Ctrl+K's command palette and `?`'s list of shortcuts. Make it the root route's component,
 * and put each route's content in a Page.
 *
 * @use For the layout of an app's pages: make it the root route's component, and give each page a Page. Put the app's
 * own parts in its slots, `header`, `sidebarHeader` and `sidebarFooter`. An app that needs another layout builds one
 * from the parts it holds, such as AppSidebar and RouteBreadcrumbs.
 * @see BasisApp, Page, AppSidebar, RouteBreadcrumbs, CommandPalette, EnvironmentBanner, UserMenu, useShortcut
 *
 * @example
 * ```tsx
 * import { AppShell, Badge, RefreshCwIcon } from "@basis/ui";
 * import { createRootRoute } from "@tanstack/react-router";
 *
 * const commands = [
 *   { icon: RefreshCwIcon, id: "refresh", label: "Refresh prices", run: () => undefined, shortcut: "mod+shift+r" },
 * ];
 *
 * export const rootRoute = createRootRoute({
 *   component: () => (
 *     <AppShell
 *       appName="Positions"
 *       environment="qa"
 *       commands={commands}
 *       header={<Badge variant="outline">Close of 6 Nov</Badge>}
 *     />
 *   ),
 * });
 * ```
 */
function AppShell({
  appName,
  environment,
  commands,
  header,
  sidebarHeader,
  sidebarFooter,
  collapsible = "offcanvas",
  children,
}: AppShellProps): ReactElement {
  const pageCrumb = usePageCrumbState();
  useDocumentTitle(appName);
  return (
    <TooltipProvider delay={tooltipDelay}>
      <ShortcutProvider>
        <PageCrumbContext value={pageCrumb}>
          <div data-slot="app-shell" className="flex h-svh flex-col">
            {environment === undefined ? null : (
              <EnvironmentBanner environment={environment} className="shrink-0" />
            )}
            <SidebarProvider className="min-h-0 flex-1 contain-layout">
              <AppSidebar
                appName={appName}
                header={sidebarHeader}
                footer={sidebarFooter}
                collapsible={collapsible}
              />
              <ShellPage header={header}>{children}</ShellPage>
            </SidebarProvider>
          </div>
          <CommandPalette commands={commands} />
        </PageCrumbContext>
      </ShortcutProvider>
    </TooltipProvider>
  );
}

export { AppShell };
export type { AppShellProps };
