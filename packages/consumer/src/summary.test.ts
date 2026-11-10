/* The one page, as a ctzd app tests it: written with @basis/ui/testing, so it runs in Chromium and in a Node DOM. */

import { renderApp, screen } from "@basis/ui/testing";
import { expect, test } from "vite-plus/test";

import { routeTree } from "./routes.ts";

test("the summary shows the book's figures in a card", async () => {
  renderApp(routeTree, "/");
  expect(await screen.findByText("Book summary")).toBeTruthy();
  expect(screen.getByText("Market value")).toBeTruthy();
});
