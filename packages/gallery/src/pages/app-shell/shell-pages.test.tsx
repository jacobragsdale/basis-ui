import "#styles.css";

import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { AppShell } from "#pages/app-shell.tsx";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the app shell page's sections", () => {
  test("Page shows a page that fills its frame and one that scrolls", async () => {
    const screen = await render(<AppShell />);
    const fills = screen.getByRole("region", { name: "A page that fills the window" });
    const scrolls = screen.getByRole("region", { name: "A page that scrolls" });
    await expect.element(fills.getByRole("heading", { level: 1, name: "Trades" })).toBeVisible();
    await expect.element(fills.getByRole("button", { name: "Export" })).toBeVisible();
    const content = scrolls.element().querySelector('[data-slot="page-content"]');
    expect((content?.scrollHeight ?? 0) > (content?.clientHeight ?? 0)).toBe(true);
  });

  test("Ctrl+K opens the palette, with the pages and the commands in their groups", async () => {
    const error = vi.spyOn(console, "error");
    await render(<AppShell />);
    await userEvent.keyboard("{Control>}k{/Control}");
    const palette = page.getByRole("dialog", { name: "Go to or run" });
    await expect.element(palette.getByRole("option", { name: "Curves" })).toBeVisible();
    const headings = [...palette.element().querySelectorAll('[data-slot="command-group-heading"]')];
    expect([headings.map((heading) => heading.textContent), error.mock.calls]).toStrictEqual([
      ["Go to", "Prices", "View", "Commands"],
      [],
    ]);
  });

  test("? lists the page's shortcuts under its title, and the app's under Everywhere", async () => {
    await render(<AppShell />);
    await userEvent.keyboard("?");
    const list = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect.element(list.getByText("Export the trades")).toBeVisible();
    await expect.element(list.getByText("Refresh the trades")).toBeVisible();
    await expect.element(list.getByText("Refresh the page")).not.toBeInTheDocument();
    expect([...list.element().querySelectorAll("th")].map((th) => th.textContent)).toStrictEqual([
      "Trades",
      "Everywhere",
    ]);
  });
});
