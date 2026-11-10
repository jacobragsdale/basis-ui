/* The shell's parts that a page uses, each on its own: Page, in its two layouts; the command palette, with commands in
 * groups, with icons and shortcuts, over a router of four pages; and the `?` list of shortcuts, the page's under its
 * title and the app's under Everywhere. The app shell page holds the one ShortcutProvider both use, as AppShell does.
 * Shown alone, the palette and the list open, as Ctrl+K and ? open them. */

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartLineIcon,
  CommandPalette,
  DownloadIcon,
  Kbd,
  LayoutDashboardIcon,
  Maximize2Icon,
  Page,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShortcutScope,
  TableIcon,
  useShortcut,
} from "@basis/ui";
import type { PaletteCommand } from "@basis/ui";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { openedByKeyboard } from "#pages/shot.ts";

/** Nothing: the examples' commands and shortcuts show what they would run, and run nothing. */
function nothing(): void {
  // An example's command.
}

const exportButton = (
  <Button variant="outline">
    <DownloadIcon data-icon="inline-start" />
    Export
  </Button>
);

const books = ["Rates", "Credit", "Munis", "Agencies", "Mortgages", "Treasuries"];

function PageSection(): ReactElement {
  return (
    <Section
      title="Page"
      description="One page of an app in AppShell: its title, a line on what it shows and its actions in a header, and its content, which fills the window, for a grid, a pivot or a chart, or scrolls under the header."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <section
          aria-label="A page that fills the window"
          className="flex h-80 flex-col overflow-hidden rounded-lg border"
        >
          <Page
            title="Trades"
            description="The desk's trades today, newest first."
            actions={exportButton}
            layout="fill"
          >
            <Card className="flex-1">
              <CardHeader>
                <CardTitle>The grid</CardTitle>
                <CardDescription>It takes the height below the header.</CardDescription>
              </CardHeader>
            </Card>
          </Page>
        </section>
        <section
          aria-label="A page that scrolls"
          className="flex h-80 flex-col overflow-hidden rounded-lg border"
        >
          <Page title="Books" description="Each book's limits, one card each.">
            {books.map((book) => (
              <Card key={book} size="sm">
                <CardHeader>
                  <CardTitle>{book}</CardTitle>
                </CardHeader>
                <CardContent>Within its limits.</CardContent>
              </Card>
            ))}
          </Page>
        </section>
      </div>
    </Section>
  );
}

const paletteCommands: readonly PaletteCommand[] = [
  {
    group: "Prices",
    icon: RefreshCwIcon,
    id: "refresh",
    keywords: ["reload", "marks"],
    label: "Refresh prices",
    run: nothing,
    shortcut: "mod+shift+r",
  },
  {
    group: "View",
    icon: Maximize2Icon,
    id: "full-screen",
    keywords: ["maximise", "expand"],
    label: "Show the grid full screen",
    run: nothing,
    shortcut: "mod+shift+f",
  },
  {
    icon: SettingsIcon,
    id: "settings",
    keywords: ["preferences"],
    label: "Settings",
    run: nothing,
  },
];

/** The palette, and the button the screenshots press its keys on. */
function PaletteFrame(): ReactElement {
  return (
    <>
      <div {...openedByKeyboard("Control+k")}>
        <Button variant="outline">
          Open with <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </Button>
      </div>
      <CommandPalette commands={paletteCommands} />
    </>
  );
}

/** A router of three pages in two groups, for the palette's list of pages. */
function paletteRouter(): ReturnType<typeof createRouter> {
  const rootRoute = createRootRoute({ component: PaletteFrame });
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      staticData: { icon: LayoutDashboardIcon, title: "Overview" },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/trades",
      staticData: { group: "Trading", icon: TableIcon, title: "Trades" },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/trades/new",
      staticData: { group: "Trading", icon: PlusIcon, title: "Book a trade" },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/curves",
      staticData: { group: "Markets", icon: ChartLineIcon, title: "Curves" },
    }),
  ]);
  return createRouter({ history: createMemoryHistory({ initialEntries: ["/"] }), routeTree });
}

const router = paletteRouter();

function CommandPaletteSection(): ReactElement {
  return (
    <Section
      title="Command palette"
      description="Ctrl+K, or Cmd+K on a Mac: the app's pages, each with its icon, then its commands under their groups, each with its icon and its shortcut, found by their label or keywords. A command's shortcut runs it with the palette closed. AppShell holds one, given its commands."
    >
      <RouterProvider router={router} />
    </Section>
  );
}

/** The page's shortcuts, in its scope. */
function TradesShortcuts(): null {
  useShortcut("e", "Export the trades", nothing);
  useShortcut("n", "Book a trade", nothing);
  useShortcut("r", "Refresh the trades", nothing);
  return null;
}

/** The app's own shortcuts, outside every scope; the page's `r` wins over this one. */
function AppShortcuts(): null {
  useShortcut("mod+b", "Toggle the sidebar", nothing);
  useShortcut("r", "Refresh the page", nothing);
  return null;
}

function KeyboardShortcutsSection(): ReactElement {
  return (
    <Section
      title="Keyboard shortcuts"
      description="? lists every shortcut the page has: the page's under its title, which win over the app's for the same keys, and the app's under Everywhere. A component declares its own with useShortcut; AppShell holds the list, and the page's scope."
    >
      <AppShortcuts />
      <ShortcutScope name="Trades">
        <TradesShortcuts />
        <div {...openedByKeyboard("?")}>
          <Button variant="outline">
            Press <Kbd>?</Kbd>
          </Button>
        </div>
      </ShortcutScope>
    </Section>
  );
}

export { CommandPaletteSection, KeyboardShortcutsSection, PageSection };
