/* The shell's parts on the app shell page: the environment banner on its own in each environment, then AppShell as an
 * app runs it, in BasisApp on a memory history with four pages in two groups, framed so its sidebar, breadcrumbs, user
 * menu, command palette (Ctrl+K) and shortcut list (?) stay inside the frame. Each page is a Page, with its title,
 * description and actions, and the header holds the data's date in its slot. */

import {
  AppShell,
  Badge,
  BasisApp,
  Button,
  CalendarIcon,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartLineIcon,
  DownloadIcon,
  EnvironmentBanner,
  LayoutDashboardIcon,
  Page,
  PlusIcon,
  RefreshCwIcon,
  fakeSignIn,
  toast,
  useShortcut,
} from "@basis/ui";
import type { PaletteCommand, Preferences } from "@basis/ui";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createElement } from "react";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

function refreshPrices(): void {
  toast.add({ title: "Prices refreshed", type: "success" });
}

const commands: readonly PaletteCommand[] = [
  {
    group: "Prices",
    icon: RefreshCwIcon,
    id: "refresh",
    keywords: ["reload", "marks"],
    label: "Refresh prices",
    run: refreshPrices,
    shortcut: "mod+shift+r",
  },
];

function Shell(): ReturnType<typeof AppShell> {
  return createElement(AppShell, {
    appName: "Positions",
    commands,
    environment: "qa",
    header: <Badge variant="outline">Close of 6 Nov</Badge>,
  });
}

function exportPage(title: string): void {
  toast.add({ title: `${title} exported`, type: "success" });
}

/** A page of the framed app: its title, a line on what it would hold, an action with its shortcut, and where to look
 * next. */
function demoPage(title: string, lead: string): () => ReactElement {
  return function DemoPage(): ReactElement {
    useShortcut("e", `Export the ${title.toLowerCase()}`, () => {
      exportPage(title);
    });
    return (
      <Page
        title={title}
        description={lead}
        actions={
          <Button
            variant="outline"
            onClick={() => {
              exportPage(title);
            }}
          >
            <DownloadIcon data-icon="inline-start" />
            Export
          </Button>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle>Try the shell</CardTitle>
            <CardDescription>
              Ctrl+K opens the command palette, ? lists the shortcuts, E exports this page, and the
              user menu at the sidebar&apos;s foot sets the mode and density.
            </CardDescription>
          </CardHeader>
          <CardContent>
            The sidebar, its groups and the breadcrumbs come from each route&apos;s staticData.
          </CardContent>
        </Card>
      </Page>
    );
  };
}

const rootRoute = createRootRoute({ component: Shell });

const routeTree = rootRoute.addChildren([
  createRoute({
    component: demoPage("Positions", "Every book's holdings, as of today's close."),
    getParentRoute: () => rootRoute,
    path: "/",
    staticData: { icon: LayoutDashboardIcon, title: "Positions" },
  }),
  createRoute({
    component: demoPage("Trades", "The desk's trades, newest first."),
    getParentRoute: () => rootRoute,
    path: "/trades",
    staticData: { group: "Trading", icon: CalendarIcon, title: "Trades" },
  }),
  createRoute({
    component: demoPage("Book a trade", "A ticket for a new trade."),
    getParentRoute: () => rootRoute,
    path: "/trades/new",
    staticData: { group: "Trading", icon: PlusIcon, title: "Book a trade" },
  }),
  createRoute({
    component: demoPage("Curves", "Today's Treasury curve against last week's."),
    getParentRoute: () => rootRoute,
    path: "/curves",
    staticData: { group: "Markets", icon: ChartLineIcon, title: "Curves" },
  }),
]);

const router = createRouter({
  history: createMemoryHistory({ initialEntries: ["/"] }),
  routeTree,
});

function EnvironmentBannerSection(): ReactElement {
  return (
    <Section
      title="Environment banner"
      description="A thin bar across the top of the page naming the environment, in its own colour, so no one mistakes a test system for production. AppShell shows it when given an environment."
    >
      <div className="flex flex-col gap-2">
        <EnvironmentBanner environment="dev" detail="positions-api on this desktop" />
        <EnvironmentBanner environment="qa" detail="positions-api, QA cluster" />
        <EnvironmentBanner environment="prod" />
      </div>
    </Section>
  );
}

/** AppShell in BasisApp, showing `preferences` when given, as the page does when its query names a mode or density,
 * and the stored choice otherwise. */
function AppShellSection({
  preferences,
}: {
  readonly preferences?: Preferences | undefined;
}): ReactElement {
  return (
    <Section
      title="App shell"
      description="AppShell in BasisApp, as every app runs it: the sidebar of the app's pages in their groups, the breadcrumbs, the header's slot, the user menu, the command palette and the keyboard shortcuts, all built from the routes, and each page a Page with its title, description and actions."
    >
      <section
        aria-label="An app on the shell"
        className="relative box-content h-svh overflow-hidden rounded-lg border transform-gpu"
      >
        <BasisApp router={router} signIn={fakeSignIn()} preferences={preferences} />
      </section>
    </Section>
  );
}

export { AppShellSection, EnvironmentBannerSection };
