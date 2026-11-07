import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { BlotterPagination, DeskBreadcrumb } from "./links.tsx";
import { all, inCompactDensity, isTarget } from "./test-helpers.ts";

describe("Breadcrumb", () => {
  test("is a navigation landmark named breadcrumb, with its links named by their text", async () => {
    const screen = await render(<DeskBreadcrumb />);
    const trail = screen.getByRole("navigation", { name: "breadcrumb" });
    await expect
      .element(trail.getByRole("link", { name: "Home" }))
      .toHaveAttribute("href", "#home");
    await expect.element(trail.getByRole("link", { name: "Rates" })).toBeVisible();
    await expect.element(trail.getByRole("list")).toBeVisible();
  });

  test("render makes a link the router's link, which stays a link", async () => {
    const screen = await render(<DeskBreadcrumb />);
    const desks = screen.getByRole("link", { name: "Desks" });
    await expect.element(desks).toHaveAttribute("href", "#desks");
    await expect.element(desks).toHaveAttribute("data-router", "true");
  });

  test("the current page is text marked aria-current, not a link", async () => {
    const screen = await render(<DeskBreadcrumb />);
    const current = screen.getByText("10-year note");
    await expect.element(current).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "10-year note" }).query()).toBeNull();
  });

  test("the separators and the ellipsis are hidden from assistive technology", async () => {
    const screen = await render(<DeskBreadcrumb />);
    const marks = all(
      screen.container,
      '[data-slot="breadcrumb-separator"], [data-slot="breadcrumb-ellipsis"]',
    );
    expect(marks.map((mark) => mark.getAttribute("aria-hidden"))).toStrictEqual(
      marks.map(() => "true"),
    );
  });

  test("its links stay 24 px targets in the compact density", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<DeskBreadcrumb />);
      const links = all(screen.container, "a");
      expect(links.filter((link) => !isTarget(link))).toStrictEqual([]);
    });
  });
});

describe("Pagination", () => {
  test("is a navigation landmark named pagination, with the previous and next links named for where they go", async () => {
    const screen = await render(<BlotterPagination />);
    const pages = screen.getByRole("navigation", { name: "pagination" });
    await expect
      .element(pages.getByRole("link", { name: "Go to previous page" }))
      .toHaveAttribute("href", "#page-1");
    await expect
      .element(pages.getByRole("link", { name: "Go to next page" }))
      .toHaveAttribute("href", "#page-3");
  });

  test("the current page's link is marked aria-current and drawn in the outline look", async () => {
    const screen = await render(<BlotterPagination />);
    const current = screen.getByRole("link", { name: "2", exact: true });
    await expect.element(current).toHaveAttribute("aria-current", "page");
    await expect.element(current).toHaveAttribute("data-variant", "outline");
    await expect
      .element(screen.getByRole("link", { name: "1", exact: true }))
      .toHaveAttribute("data-variant", "ghost");
  });

  test("render makes a page link the router's link, which stays a link", async () => {
    const screen = await render(<BlotterPagination />);
    const third = screen.getByRole("link", { name: "3", exact: true });
    await expect.element(third).toHaveAttribute("href", "#page-3");
    await expect.element(third).toHaveAttribute("data-router", "true");
  });

  test("its links stay 24 px targets in the compact density", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<BlotterPagination />);
      const links = all(screen.container, "a");
      expect(links.filter((link) => !isTarget(link))).toStrictEqual([]);
    });
  });
});
