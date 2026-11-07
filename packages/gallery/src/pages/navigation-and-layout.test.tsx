import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { NavigationAndLayout } from "./navigation-and-layout.tsx";
import { atDesktopWidth } from "./navigation-and-layout/test-helpers.ts";

const families = [
  "Sidebar",
  "Navigation Menu",
  "Tabs",
  "Breadcrumb",
  "Pagination",
  "Accordion",
  "Collapsible",
  "Resizable",
  "Scroll Area",
  "Separator",
  "Aspect Ratio",
  "Card",
  "Item",
] as const;

describe("the navigation and layout page", () => {
  test("shows every component of the family, in the design's order, each in a region under its heading", async () => {
    await atDesktopWidth();
    const screen = await render(<NavigationAndLayout />);
    const headings = screen.getByRole("heading", { level: 2 }).all();
    expect(headings.map((heading) => heading.element().textContent)).toStrictEqual([...families]);
    const missing = families.filter(
      (family) => screen.getByRole("region", { name: family }).query() === null,
    );
    expect(missing).toStrictEqual([]);
  });

  test("shows its menus, tooltips and sheets closed", async () => {
    await atDesktopWidth();
    const screen = await render(<NavigationAndLayout />);
    expect(screen.getByRole("dialog").query()).toBeNull();
    expect(document.querySelector("[data-slot=tooltip-content]")).toBeNull();
    const triggers = screen.getByRole("navigation", { name: "Desk" }).getByRole("button").all();
    const expanded = triggers.map((trigger) => trigger.element().getAttribute("aria-expanded"));
    expect(expanded).toStrictEqual(["false", "false"]);
  });
});
