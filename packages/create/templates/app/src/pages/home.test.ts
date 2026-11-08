/* Written with @basis/ui/testing, so it runs in Chromium and in a Node DOM (BASIS_TEST_DOM=node vp test). */

import { renderApp, screen } from "@basis/ui/testing";
import { expect, test } from "vite-plus/test";

import { routeTree } from "#routes.ts";

test("the home page shows in the shell, with its link in the sidebar", async () => {
  renderApp(routeTree, "/");
  expect(await screen.findByRole("heading", { name: "Home" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
});
