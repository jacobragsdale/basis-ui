import "#styles.css";

import {
  AppShell,
  BasisApp,
  Button,
  ChartLineIcon,
  LayoutDashboardIcon,
  Page,
  TableIcon,
  fakeSignIn,
} from "@basis/ui";
import type { AppShellProps } from "@basis/ui";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import type { Locator } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import type { RenderResult } from "vitest-browser-react";

type ShellProps = Omit<AppShellProps, "appName">;

/** A page titled `title`, holding its title. */
function pageOf(title: string): () => ReactElement {
  return function TitledPage(): ReactElement {
    return <Page title={title}>{title}</Page>;
  };
}

/** The app's router, its shell given `props`, with a start page and two pages in each of two groups. */
function appRouter(props: ShellProps): AnyRouter {
  function Shell(): ReactElement {
    return <AppShell appName="Rates" {...props} />;
  }
  const rootRoute = createRootRoute({ component: Shell });
  const routeTree = rootRoute.addChildren([
    createRoute({
      component: pageOf("Overview"),
      getParentRoute: () => rootRoute,
      path: "/",
      staticData: { icon: LayoutDashboardIcon, title: "Overview" },
    }),
    createRoute({
      component: pageOf("Trades"),
      getParentRoute: () => rootRoute,
      path: "/trades",
      staticData: { group: "Tables", icon: TableIcon, title: "Trades" },
    }),
    createRoute({
      component: pageOf("Curves"),
      getParentRoute: () => rootRoute,
      path: "/curves",
      staticData: { group: "Charts", icon: ChartLineIcon, title: "Curves" },
    }),
    createRoute({
      component: pageOf("Positions"),
      getParentRoute: () => rootRoute,
      path: "/positions",
      staticData: { group: "Tables", icon: TableIcon, title: "Positions" },
    }),
  ]);
  return createRouter({ history: createMemoryHistory({ initialEntries: ["/"] }), routeTree });
}

/** The app, its shell given `props`, in a frame of its own. */
async function renderApp(props: ShellProps = {}): Promise<RenderResult> {
  return render(
    <section aria-label="An app" className="relative h-svh overflow-hidden transform-gpu">
      <BasisApp router={appRouter(props)} signIn={fakeSignIn()} />
    </section>,
  );
}

beforeEach(async () => {
  await page.viewport(1280, 800);
  await cookieStore.delete("basis-ui-sidebar");
});

afterEach(async () => {
  await cookieStore.delete("basis-ui-sidebar");
});

describe("the sidebar's groups", () => {
  test("puts each page under its group's heading, the groups in the order of their first pages", async () => {
    const screen = await renderApp();
    const pages = screen.getByRole("navigation", { name: "Pages" });
    await expect.element(pages.getByRole("link", { name: "Trades" })).toBeVisible();
    const groups = [...pages.element().querySelectorAll('[data-slot="sidebar-group"]')].map(
      (group) => ({
        label: group.querySelector('[data-slot="sidebar-group-label"]')?.textContent,
        links: [...group.querySelectorAll("a")].map((link) => link.textContent),
      }),
    );
    expect(groups).toStrictEqual([
      { label: undefined, links: ["Overview"] },
      { label: "Tables", links: ["Trades", "Positions"] },
      { label: "Charts", links: ["Curves"] },
    ]);
  });

  test("marks only the page shown as the current page, the start page included", async () => {
    const screen = await renderApp();
    const pages = screen.getByRole("navigation", { name: "Pages" });
    await pages.getByRole("link", { name: "Curves" }).click();
    await expect.element(screen.getByRole("heading", { level: 1, name: "Curves" })).toBeVisible();
    const current = pages
      .getByRole("link")
      .elements()
      .filter((link) => link.getAttribute("aria-current") === "page")
      .map((link) => link.textContent);
    expect(current).toStrictEqual(["Curves"]);
  });

  test("folded to its icon rail, a group's last page takes the pointer, under the next group's hidden heading", async () => {
    const screen = await renderApp({ collapsible: "icon" });
    await expect.element(screen.getByRole("link", { name: "Positions" })).toBeVisible();
    await userEvent.keyboard("{Control>}b{/Control}");
    const sidebar = screen.container.querySelector<HTMLElement>('[data-slot="sidebar"]');
    await expect.poll(() => sidebar?.dataset["state"]).toBe("collapsed");
    await screen.getByRole("link", { name: "Positions" }).click({ timeout: 2000 });
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Positions" }))
      .toBeVisible();
  });

  test("folded to its icon rail, a page's link is named by a tooltip", async () => {
    const screen = await renderApp({ collapsible: "icon" });
    await expect.element(screen.getByRole("link", { name: "Trades" })).toBeVisible();
    await userEvent.keyboard("{Control>}b{/Control}");
    const sidebar = screen.container.querySelector<HTMLElement>('[data-slot="sidebar"]');
    await expect.poll(() => sidebar?.dataset["collapsible"]).toBe("icon");
    await userEvent.hover(screen.getByRole("link", { name: "Trades" }));
    await expect
      .element(page.getByText("Trades", { exact: true }).last())
      .toHaveAttribute("data-slot", "tooltip-content");
  });
});

describe("the shell's slots", () => {
  test("the header holds its slot after the breadcrumbs", async () => {
    const screen = await renderApp({ header: <span>Close of 6 Nov</span> });
    await expect.element(screen.getByText("Close of 6 Nov")).toBeVisible();
    const header = screen.getByText("Close of 6 Nov").element().closest("header");
    const trail = header?.querySelector('[aria-label="breadcrumb"]');
    expect(trail?.compareDocumentPosition(screen.getByText("Close of 6 Nov").element())).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  test("the sidebar's header holds its slot under the app's name", async () => {
    const screen = await renderApp({ sidebarHeader: <span>Rates desk</span> });
    await expect.element(screen.getByText("Rates desk")).toBeVisible();
    const header = screen.getByText("Rates desk").element().closest('[data-slot="sidebar-header"]');
    expect(header?.textContent).toBe("RatesRates desk");
  });

  test("the sidebar's footer slot takes the user menu's place", async () => {
    const screen = await renderApp({ sidebarFooter: <Button variant="ghost">Settings</Button> });
    await expect.element(screen.getByRole("button", { name: "Settings" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Dev User" })).not.toBeInTheDocument();
  });

  test("without a footer slot, the footer holds the user menu", async () => {
    const screen = await renderApp();
    await expect.element(screen.getByRole("button", { name: "Dev User" })).toBeVisible();
  });
});

/** How long the tooltip that names `link` on the icon rail takes to open once the pointer rests on it, in ms. */
async function tooltipWait(link: Locator, name: string): Promise<number> {
  const started = performance.now();
  await userEvent.hover(link);
  await expect
    .poll(
      () =>
        [...document.querySelectorAll('[data-slot="tooltip-content"]')].some(
          (tooltip) => tooltip.textContent === name,
        ),
      { interval: 10 },
    )
    .toBe(true);
  return performance.now() - started;
}

describe("the shell's tooltips", () => {
  test("share one delay: the first opens after it, and a neighbour's then opens at once", async () => {
    const screen = await renderApp({ collapsible: "icon" });
    await expect.element(screen.getByRole("link", { name: "Trades" })).toBeVisible();
    await userEvent.keyboard("{Control>}b{/Control}");
    const sidebar = screen.container.querySelector<HTMLElement>('[data-slot="sidebar"]');
    await expect.poll(() => sidebar?.dataset["state"]).toBe("collapsed");
    const first = await tooltipWait(screen.getByRole("link", { name: "Trades" }), "Trades");
    const next = await tooltipWait(screen.getByRole("link", { name: "Positions" }), "Positions");
    // Without the shell's provider, each would wait Base UI's own 600 ms; with a delay of 0, the first would not.
    expect([first >= 350, next < 300]).toStrictEqual([true, true]);
  });
});
