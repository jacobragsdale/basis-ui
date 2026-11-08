/* The shell the example's pages sit in, AppShell, as an app's tests are written: with @basis/ui/testing, so they run
 * in Chromium and in a Node DOM. */

import { fakeSignIn } from "@basis/ui";
import { mockApi, renderApp, screen, userEvent, within } from "@basis/ui/testing";
import type { MockApi } from "@basis/ui/testing";
import { afterAll, afterEach, describe, expect, test } from "vite-plus/test";

import { getBondMockHandler, getConventionsMockHandler } from "#api/mocks.ts";
import { routeTree } from "#routes.ts";

const api: MockApi = await mockApi(
  getConventionsMockHandler([{ convention: "ACT/365F", year_days: 365 }]),
  getBondMockHandler({
    convention: "30/360",
    coupon_rate: 0.04125,
    frequency: 2,
    issued: "2026-05-15",
    maturity: "2036-05-15",
    security_id: "US91282CRF04",
  }),
);

afterEach(() => {
  api.reset();
  delete document.documentElement.dataset["density"];
});

afterAll(async () => {
  await api.close();
});

describe("the example's shell, with or without a browser", () => {
  test("the sidebar lists each titled page without parameters, the current one marked", async () => {
    renderApp(routeTree, "/", { signIn: fakeSignIn() });
    const pages = await screen.findByRole("link", { name: "Day count conventions" });
    expect(screen.getByRole("link", { name: "Record a settlement" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Bond" })).toBeNull();
    expect(pages.closest("[data-active]")).not.toBeNull();
  });

  test("the breadcrumbs name the page shown", async () => {
    renderApp(routeTree, "/bonds/US91282CRF04", { signIn: fakeSignIn() });
    const trail = await screen.findByRole("navigation", { name: "breadcrumb" });
    expect(within(trail).getByText("Bond")).toBeTruthy();
  });

  test("Ctrl+K opens the command palette, which goes to a page", async () => {
    renderApp(routeTree, "/", { signIn: fakeSignIn() });
    await screen.findByRole("cell", { name: "ACT/365F" });
    const user = userEvent.setup();
    await user.keyboard("{Control>}k{/Control}");
    const palette = await screen.findByRole("dialog", { name: "Go to or run" });
    await user.click(within(palette).getByText("Record a settlement"));
    expect(await screen.findByLabelText("Face amount")).toBeTruthy();
  });

  test("? lists the page's keyboard shortcuts", async () => {
    renderApp(routeTree, "/", { signIn: fakeSignIn() });
    await screen.findByRole("cell", { name: "ACT/365F" });
    await userEvent.setup().keyboard("?");
    const list = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(list).getByText("Open the command palette")).toBeTruthy();
  });

  test("the user menu sets the density every app shows", async () => {
    renderApp(routeTree, "/", { signIn: fakeSignIn() });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Dev User" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Compact" }));
    expect(document.documentElement.dataset["density"]).toBe("compact");
  });
});
