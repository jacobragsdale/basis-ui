import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { DeskTabs } from "./tabs.tsx";
import { all, inCompactDensity, isTarget, only } from "./test-helpers.ts";

describe("Tabs", () => {
  test("is a tablist of tabs named by their text, the open one selected and its panel named by it", async () => {
    const screen = await render(<DeskTabs />);
    await expect.element(screen.getByRole("tablist")).toBeVisible();
    await expect
      .element(screen.getByRole("tab", { name: "Positions" }))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(screen.getByRole("tabpanel", { name: "Positions" }))
      .toHaveTextContent("Net long 42 million in the 10-year.");
  });

  test("the arrow keys move between the tabs, and Enter opens the one focused", async () => {
    const screen = await render(<DeskTabs />);
    const history = screen.getByRole("tab", { name: "History" });
    screen.getByRole("tab", { name: "Positions" }).element().focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(history).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect.element(history).toHaveAttribute("aria-selected", "true");
    await expect
      .element(screen.getByRole("tabpanel"))
      .toHaveTextContent("Twelve fills since the open.");
  });

  test("a disabled tab takes focus from the arrow keys, but Enter leaves it closed", async () => {
    const screen = await render(<DeskTabs />);
    const breaks = screen.getByRole("tab", { name: "Breaks" });
    screen.getByRole("tab", { name: "Positions" }).element().focus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(breaks).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect.element(breaks).toHaveAttribute("aria-selected", "false");
    await expect
      .element(screen.getByRole("tab", { name: "Positions" }))
      .toHaveAttribute("aria-selected", "true");
  });

  test("vertical, the list is marked so and the down arrow moves along it", async () => {
    const screen = await render(<DeskTabs orientation="vertical" />);
    await expect
      .element(screen.getByRole("tablist"))
      .toHaveAttribute("aria-orientation", "vertical");
    screen.getByRole("tab", { name: "Positions" }).element().focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(screen.getByRole("tab", { name: "History" })).toHaveFocus();
  });

  test("the default and line lists look different, and the line list underlines the open tab", async () => {
    const screen = await render(
      <>
        <DeskTabs />
        <DeskTabs variant="line" />
      </>,
    );
    const [plain, line] = all(screen.container, '[data-slot="tabs-list"]');
    expect(getComputedStyle(plain ?? document.body).backgroundColor).not.toBe(
      getComputedStyle(line ?? document.body).backgroundColor,
    );
    const open = only(line ?? document.body, '[data-slot="tabs-trigger"][data-active]');
    expect(getComputedStyle(open, "::after").opacity).toBe("1");
  });

  test("its tabs stay 24 px targets in the compact density", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<DeskTabs />);
      const tabs = all(screen.container, '[role="tab"]');
      expect(tabs.filter((tab) => !isTarget(tab))).toStrictEqual([]);
    });
  });
});
