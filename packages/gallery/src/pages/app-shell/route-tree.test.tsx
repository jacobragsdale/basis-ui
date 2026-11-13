/* The shell's navigation on a route tree that is not flat: an index route under a parent, a layout route titled for
 * its breadcrumb, a pathless layout, and a titled root. The sidebar and the palette list each page once, by the path
 * a link reaches it at, and mark the page shown. */

import "#styles.css";

import { AppShell, BasisApp, fakeSignIn } from "@basis/ui";
import {
  Outlet,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

function Shell(): ReactElement {
  return <AppShell appName="Trading" />;
}

function Heading({ text }: { readonly text: string }): ReactElement {
  return <h1>{text}</h1>;
}

const rootRoute = createRootRoute({ component: Shell, staticData: { title: "Desk" } });

const books = createRoute({
  component: Outlet,
  getParentRoute: () => rootRoute,
  path: "/positions",
  staticData: { title: "Books" },
});

const area = createRoute({
  component: Outlet,
  getParentRoute: () => rootRoute,
  id: "area",
  staticData: { title: "Area" },
});

const routeTree = rootRoute.addChildren([
  createRoute({
    component: () => <Heading text="Home" />,
    getParentRoute: () => rootRoute,
    path: "/",
    staticData: { title: "Home" },
  }),
  books.addChildren([
    createRoute({
      component: () => <Heading text="Positions" />,
      getParentRoute: () => books,
      path: "/",
      staticData: { title: "Positions" },
    }),
    createRoute({
      component: () => <Heading text="A position" />,
      getParentRoute: () => books,
      path: "$position",
      staticData: { title: "Position" },
    }),
  ]),
  area.addChildren([
    createRoute({
      component: () => <Heading text="Trades" />,
      getParentRoute: () => area,
      path: "/trades",
      staticData: { title: "Trades" },
    }),
  ]),
]);

/** The app, in a frame of its own, opened at `path`. */
function DeskApp({ path }: { readonly path: string }): ReactElement {
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

/** The names of the sidebar's links. */
function sidebarLinks(): string[] {
  return [...document.querySelectorAll('[data-slot="sidebar"] a')].map((link) =>
    link.textContent.trim(),
  );
}

beforeEach(async () => {
  await page.viewport(1280, 800);
});

describe("the shell's navigation on a nested route tree", () => {
  test("lists each page once, leaving out the root, a titled layout and a pathless one", async () => {
    await render(<DeskApp path="/" />);
    await expect.element(page.getByRole("heading", { name: "Home" })).toBeVisible();
    expect(sidebarLinks().filter((name) => name !== "Trading")).toStrictEqual([
      "Home",
      "Positions",
      "Trades",
    ]);
  });

  test("an index route under a parent is marked on its page and the pages below it", async () => {
    await render(<DeskApp path="/positions/abc" />);
    await expect.element(page.getByRole("heading", { name: "A position" })).toBeVisible();
    await expect
      .element(page.getByRole("link", { name: "Positions" }).first())
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(page.getByRole("link", { name: "Home" }).first())
      .not.toHaveAttribute("aria-current");
  });

  test("the palette offers the same pages, and takes the user to the index route's path", async () => {
    await render(<DeskApp path="/" />);
    await expect.element(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await userEvent.keyboard("{Control>}k{/Control}");
    const options = page.getByRole("dialog").getByRole("option");
    await expect.element(options.first()).toBeVisible();
    const names = options.elements().map((option) => option.textContent.trim());
    expect(names.filter((name) => ["Books", "Desk", "Area"].includes(name))).toStrictEqual([]);
    await page.getByRole("option", { name: "Positions" }).click();
    await expect.element(page.getByRole("heading", { name: "Positions" })).toBeVisible();
  });

  test("in a window under 768 px, the sidebar's sheet closes once a page is chosen from it", async () => {
    await page.viewport(700, 800);
    await render(<DeskApp path="/" />);
    await expect.element(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("link", { name: "Trades" }).click();
    await expect.element(page.getByRole("heading", { name: "Trades" })).toBeVisible();
    await expect.element(sheet).not.toBeInTheDocument();
  });
});
