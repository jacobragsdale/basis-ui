import "#styles.css";

import { AppShell, BasisApp, Button, Page, fakeSignIn } from "@basis/ui";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

const bondName = "UST 4.125% 11/30/2029";

/** Rows enough to overflow any window. */
const manyRows = Array.from({ length: 80 }, (_row, index) => `Trade ${String(index + 1)}`);

/** A page whose data arrives after it renders, as a query's does: the bond's name, a moment later. */
function BondPage(): ReactElement {
  const [name, setName] = useState<string | undefined>();
  useEffect(() => {
    const timer = setTimeout(() => {
      setName(bondName);
    }, 50);
    return (): void => {
      clearTimeout(timer);
    };
  }, []);
  return (
    <Page title={name ?? "A bond"} breadcrumb={name}>
      <p>The bond.</p>
    </Page>
  );
}

function TradesPage(): ReactElement {
  return (
    <Page
      title="Trades"
      description="The desk's trades today."
      actions={<Button variant="outline">Export</Button>}
    >
      {manyRows.map((row) => (
        <p key={row}>{row}</p>
      ))}
    </Page>
  );
}

function GridPage(): ReactElement {
  return (
    <Page title="Positions" layout="fill">
      <div data-testid="grid" className="flex-1">
        The grid
      </div>
    </Page>
  );
}

function Shell(): ReactElement {
  return <AppShell appName="Bonds" />;
}

const rootRoute = createRootRoute({ component: Shell });

const routeTree = rootRoute.addChildren([
  createRoute({
    component: GridPage,
    getParentRoute: () => rootRoute,
    path: "/",
    staticData: { title: "Positions" },
  }),
  createRoute({
    component: TradesPage,
    getParentRoute: () => rootRoute,
    path: "/trades",
    staticData: { title: "Trades" },
  }),
  createRoute({
    component: BondPage,
    getParentRoute: () => rootRoute,
    path: "/bonds/$security",
    staticData: { title: "Bond" },
  }),
]);

/** The app, in a frame of its own, opened at `path`. */
function App({ path }: { readonly path: string }): ReactElement {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree,
  });
  return (
    <section aria-label="An app" className="relative h-svh overflow-hidden transform-gpu">
      <BasisApp router={router} signIn={fakeSignIn()} />
    </section>
  );
}

/** The element a slot names inside `root`. */
function slot(root: ParentNode, name: string): HTMLElement {
  const found = root.querySelector(`[data-slot="${name}"]`);
  if (!(found instanceof HTMLElement)) {
    throw new TypeError(`Nothing has data-slot="${name}".`);
  }
  return found;
}

beforeEach(async () => {
  await page.viewport(1280, 800);
});

describe(Page, () => {
  test("heads the page with its title, its description and its actions", async () => {
    const screen = await render(<App path="/trades" />);
    await expect.element(screen.getByRole("heading", { level: 1, name: "Trades" })).toBeVisible();
    const header = page.elementLocator(slot(screen.container, "page-header"));
    await expect.element(header.getByText("The desk's trades today.")).toBeVisible();
    await expect.element(header.getByRole("button", { name: "Export" })).toBeVisible();
  });

  test("a scrolling page scrolls its content under its header, and the shell does not scroll", async () => {
    const screen = await render(<App path="/trades" />);
    await expect.element(screen.getByText("Trade 80")).toBeInTheDocument();
    const content = slot(screen.container, "page-content");
    const main = screen.container.querySelector("main");
    expect([
      content.scrollHeight > content.clientHeight,
      getComputedStyle(content).overflowY,
      main?.scrollHeight === main?.clientHeight,
    ]).toStrictEqual([true, "auto", true]);
  });

  test("a scrolling page's content takes the focus, named by its title, so the keyboard can scroll it", async () => {
    const screen = await render(<App path="/trades" />);
    const content = screen.getByRole("region", { name: "Trades" });
    await expect.element(content).toBeVisible();
    content.element().focus();
    await expect.element(content).toHaveFocus();
  });

  test("a page that fills the window gives its content the height below its header, and nothing scrolls", async () => {
    const screen = await render(<App path="/" />);
    await expect.element(screen.getByTestId("grid")).toBeVisible();
    const content = slot(screen.container, "page-content");
    const grid = screen.getByTestId("grid").element().getBoundingClientRect();
    const frame = screen.getByRole("region", { name: "An app" }).element().getBoundingClientRect();
    const padding = Number(getComputedStyle(content).paddingBottom.replace("px", ""));
    expect([
      getComputedStyle(content).overflowY,
      content.scrollHeight === content.clientHeight,
      Math.round(frame.bottom - grid.bottom) === Math.round(padding),
    ]).toStrictEqual(["hidden", true, true]);
  });

  test("its breadcrumb, from data that arrives after it renders, titles the page's breadcrumb", async () => {
    const screen = await render(<App path="/bonds/912810TM0" />);
    const trail = screen.getByRole("navigation", { name: "breadcrumb" });
    await expect.element(trail.getByText("Bond", { exact: true })).toBeVisible();
    await expect.element(trail.getByText(bondName)).toBeVisible();
    await expect.element(trail.getByText("Bond", { exact: true })).not.toBeInTheDocument();
  });

  test("leaving the page takes its breadcrumb with it", async () => {
    const screen = await render(<App path="/bonds/912810TM0" />);
    const trail = screen.getByRole("navigation", { name: "breadcrumb" });
    await expect.element(trail.getByText(bondName)).toBeVisible();
    await screen.getByRole("link", { name: "Trades" }).click();
    await expect.element(trail.getByText("Trades")).toBeVisible();
    await expect.element(trail.getByText(bondName)).not.toBeInTheDocument();
  });
});
