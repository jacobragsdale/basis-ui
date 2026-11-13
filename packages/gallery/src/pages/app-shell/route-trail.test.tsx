import "#styles.css";

import { AppShell, BasisApp, fakeSignIn } from "@basis/ui";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

/** A security as its page's loader gives it. */
interface Security {
  readonly cusip: string;
  readonly name: string;
}

const bond: Security = { cusip: "912810TM0", name: "UST 4.125% 11/30/2029" };

function isSecurity(value: unknown): value is Security {
  return typeof value === "object" && value !== null && "name" in value && "cusip" in value;
}

function Shell(): ReactElement {
  return <AppShell appName="Bonds" />;
}

function PositionsPage(): ReactElement {
  return <h1>Positions</h1>;
}

function BondsPage(): ReactElement {
  return <h1>Bonds</h1>;
}

function BondPage(): ReactElement {
  return <h1>A bond</h1>;
}

const rootRoute = createRootRoute({ component: Shell });

/** Three pages, the last one a bond's, whose breadcrumb is the bond's name. */
const routeTree = rootRoute.addChildren([
  createRoute({
    component: PositionsPage,
    getParentRoute: () => rootRoute,
    path: "/",
    staticData: { title: "Positions" },
  }),
  createRoute({
    component: BondsPage,
    getParentRoute: () => rootRoute,
    path: "/bonds",
    staticData: { title: "Bonds" },
  }),
  createRoute({
    component: BondPage,
    getParentRoute: () => rootRoute,
    loader: (): Security => bond,
    path: "/bonds/$security",
    staticData: {
      breadcrumb: ({ loaderData }) => (isSecurity(loaderData) ? loaderData.name : undefined),
      title: "Bond",
    },
  }),
]);

/** The app, in a frame of its own, opened at `path`. */
function BondsApp({ path }: { readonly path: string }): ReactElement {
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

beforeEach(async () => {
  await page.viewport(1280, 800);
});

describe("the shell's navigation", () => {
  test("a page below a sidebar item, such as a bond's under Bonds, marks that item", async () => {
    const screen = await render(<BondsApp path={`/bonds/${bond.cusip}`} />);
    await expect.element(screen.getByRole("heading", { name: "A bond" })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Bonds" }).first())
      .toHaveAttribute("data-active");
    await expect
      .element(screen.getByRole("link", { name: "Positions" }))
      .not.toHaveAttribute("data-active");
  });

  test("the start page marks only its own item", async () => {
    const screen = await render(<BondsApp path="/" />);
    await expect.element(screen.getByRole("heading", { name: "Positions" })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Positions" }))
      .toHaveAttribute("data-active");
    await expect
      .element(screen.getByRole("link", { name: "Bonds" }))
      .not.toHaveAttribute("data-active");
  });

  test("the window's title names the page shown, then the app", async () => {
    const screen = await render(<BondsApp path="/" />);
    await expect.element(screen.getByRole("heading", { name: "Positions" })).toBeVisible();
    await expect.poll(() => document.title).toBe("Positions · Bonds");
  });

  test("a page's breadcrumb can be titled by its data", async () => {
    const screen = await render(<BondsApp path={`/bonds/${bond.cusip}`} />);
    const trail = screen.getByRole("navigation", { name: "breadcrumb" });
    await expect.element(trail.getByText(bond.name)).toBeVisible();
  });
});
