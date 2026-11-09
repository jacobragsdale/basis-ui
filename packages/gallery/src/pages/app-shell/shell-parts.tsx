/* The shell's parts on the app shell page: the environment banner on its own in each environment, then AppShell as an
 * app runs it, in BasisApp on a memory history with three pages, framed so its sidebar, breadcrumbs, user menu,
 * command palette (Ctrl+K) and shortcut list (?) stay inside the frame. */

import {
  AppShell,
  BasisApp,
  CalendarIcon,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EnvironmentBanner,
  LayoutDashboardIcon,
  PlusIcon,
  TypographyH1,
  TypographyLead,
  fakeSignIn,
  toast,
} from "@basis/ui";
import type { Preferences } from "@basis/ui";
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

const commands = [{ id: "refresh", label: "Refresh prices", run: refreshPrices }];

function Shell(): ReturnType<typeof AppShell> {
  return createElement(AppShell, { appName: "Positions", commands, environment: "qa" });
}

/** A page of the framed app: its title, a line on what it would hold, and where to look next. */
function demoPage(title: string, lead: string): () => ReactElement {
  return function DemoPage(): ReactElement {
    return (
      <>
        <TypographyH1>{title}</TypographyH1>
        <TypographyLead>{lead}</TypographyLead>
        <Card>
          <CardHeader>
            <CardTitle>Try the shell</CardTitle>
            <CardDescription>
              Ctrl+K opens the command palette, ? lists the shortcuts, and the user menu at the
              sidebar&apos;s foot sets the mode and density.
            </CardDescription>
          </CardHeader>
          <CardContent>
            The sidebar and breadcrumbs come from each route&apos;s staticData.
          </CardContent>
        </Card>
      </>
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
    staticData: { icon: CalendarIcon, title: "Trades" },
  }),
  createRoute({
    component: demoPage("Book a trade", "A ticket for a new trade."),
    getParentRoute: () => rootRoute,
    path: "/trades/new",
    staticData: { icon: PlusIcon, title: "Book a trade" },
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
      description="AppShell in BasisApp, as every app runs it: the sidebar of the app's pages, the breadcrumbs, the user menu, the command palette and the keyboard shortcuts, all built from the routes."
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
