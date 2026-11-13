// @vitest-environment happy-dom
/* The browser tab's title, which AppShell keeps to the page shown: the route's staticData title, then the app's name,
 * or the app's name alone. The shell's look is tested in a browser, in packages/gallery. */

import { act, cleanup, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { AppShell, BasisApp, fakeSignIn } from "#index.ts";
import { documentTitle } from "#components/document-title.ts";

afterEach(() => {
  cleanup();
});

describe(documentTitle, () => {
  test("names the page, then the app", () => {
    expect(documentTitle("Positions", "Workbench")).toBe("Positions · Workbench");
  });

  test("names the app alone for a page with no title", () => {
    expect(documentTitle(undefined, "Workbench")).toBe("Workbench");
    expect(documentTitle("", "Workbench")).toBe("Workbench");
  });
});

/** An app of two routes, one titled and one not, opened at `path`. */
function appAt(path: string): ReturnType<typeof createRouter> {
  const rootRoute = createRootRoute({ component: () => <AppShell appName="Workbench" /> });
  return createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: rootRoute.addChildren([
      createRoute({
        component: () => <h1>Positions</h1>,
        getParentRoute: () => rootRoute,
        path: "/",
        staticData: { title: "Positions" },
      }),
      createRoute({
        component: () => <h1>Untitled</h1>,
        getParentRoute: () => rootRoute,
        path: "/untitled",
      }),
    ]),
  });
}

describe("AppShell's tab title", () => {
  test("follows the page shown, from one route to the next", async () => {
    const router = appAt("/");
    render(<BasisApp router={router} signIn={fakeSignIn()} />);
    await screen.findByRole("heading", { name: "Positions" });
    expect(document.title).toBe("Positions · Workbench");
    await act(async () => router.navigate({ to: "/untitled" }));
    await screen.findByRole("heading", { name: "Untitled" });
    expect(document.title).toBe("Workbench");
  });
});
