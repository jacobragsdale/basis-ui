import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { DeskNavigation } from "./navigation-menu.tsx";
import { inCompactDensity, isTarget, only, sizeOf } from "./test-helpers.ts";

describe("NavigationMenu", () => {
  test("is a navigation landmark named by its aria-label, with its triggers as buttons that start closed", async () => {
    const screen = await render(<DeskNavigation />);
    const navigation = screen.getByRole("navigation", { name: "Desk" });
    await expect.element(navigation).toBeVisible();
    const markets = navigation.getByRole("button", { name: "Markets" });
    await expect.element(markets).toHaveAttribute("aria-expanded", "false");
    await expect.element(navigation.getByRole("button", { name: "Research" })).toBeVisible();
  });

  test("the arrow keys move along the top level, to the triggers and the link", async () => {
    const screen = await render(<DeskNavigation />);
    screen.getByRole("button", { name: "Markets" }).element().focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(screen.getByRole("button", { name: "Research" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(screen.getByRole("link", { name: "Calendar" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(screen.getByRole("button", { name: "Research" })).toHaveFocus();
  });

  test("Enter opens a trigger's menu, whose links are named by their text, and Escape closes it", async () => {
    const screen = await render(<DeskNavigation />);
    const markets = screen.getByRole("button", { name: "Markets" });
    markets.element().focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(markets).toHaveAttribute("aria-expanded", "true");
    await expect.element(screen.getByRole("link", { name: /^Credit/u })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(markets).toHaveAttribute("aria-expanded", "false");
  });

  test("its indicator shows below the open item", async () => {
    const screen = await render(<DeskNavigation />);
    const indicator = only(screen.container, '[data-slot="navigation-menu-indicator"]');
    expect(getComputedStyle(indicator).opacity).toBe("0");
    await userEvent.click(screen.getByRole("button", { name: "Research" }));
    await expect.element(indicator).toHaveAttribute("data-popup-open");
  });

  test("an active top-level link marks the current page and looks like the triggers beside it", async () => {
    const screen = await render(<DeskNavigation />);
    const calendar = screen.getByRole("link", { name: "Calendar" });
    await expect.element(calendar).toHaveAttribute("aria-current", "page");
    const trigger = screen.getByRole("button", { name: "Markets" }).element();
    expect(sizeOf(calendar.element())[1]).toBe(sizeOf(trigger)[1]);
  });

  test("its triggers and links stay 24 px targets in the compact density", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<DeskNavigation />);
      expect(isTarget(screen.getByRole("button", { name: "Markets" }).element())).toBe(true);
      expect(isTarget(screen.getByRole("link", { name: "Calendar" }).element())).toBe(true);
    });
  });
});
