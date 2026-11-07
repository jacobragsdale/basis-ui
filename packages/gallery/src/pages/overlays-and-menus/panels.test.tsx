import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import type { Locator } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { clickOutside, focusIsIn, focusReturnsTo } from "./helpers.ts";
import { DrawerExample, SheetExample } from "./panels.tsx";

const sides = ["top", "right", "bottom", "left"] as const;
const panel = page.getByRole("dialog", { name: "Trade details" });

/** How far `element` stands from the window's edge on `side`. */
function gapToEdge(element: Element, side: (typeof sides)[number]): number {
  const box = element.getBoundingClientRect();
  const gaps = {
    bottom: window.innerHeight - box.bottom,
    left: box.left,
    right: window.innerWidth - box.right,
    top: box.top,
  };
  return gaps[side];
}

/** Renders the sheet from the right and returns its trigger. */
async function renderSheet(): Promise<Locator> {
  const screen = await render(<SheetExample side="right" />);
  return screen.getByRole("button", { name: "Trade details, right" });
}

/** Renders the drawer from the bottom and returns its trigger. */
async function renderDrawer(): Promise<Locator> {
  const screen = await render(<DrawerExample />);
  return screen.getByRole("button", { name: "Drawer, down" });
}

describe("Sheet", () => {
  test.each(sides)(
    "from the %s, it is a dialog named by its title against that edge, and focus moves in",
    async (side) => {
      const screen = await render(<SheetExample side={side} />);
      await userEvent.click(screen.getByRole("button", { name: `Trade details, ${side}` }));
      await expect.element(panel).toHaveAttribute("data-side", side);
      await expect.element(panel).toHaveAccessibleDescription("The ticket as the desk booked it.");
      await focusIsIn(panel);
      // Measured once the opening slide has finished.
      await expect.poll(() => Math.round(gapToEdge(panel.element(), side))).toBe(0);
    },
  );

  test("Enter on the trigger opens it, and Escape closes it and returns focus to the trigger", async () => {
    const trigger = await renderSheet();
    trigger.element().focus();
    await userEvent.keyboard("{Enter}");
    await focusIsIn(panel);
    await userEvent.keyboard("{Escape}");
    await expect.element(panel).not.toBeInTheDocument();
    await focusReturnsTo(trigger);
  });

  test("its close button closes it", async () => {
    await userEvent.click(await renderSheet());
    await userEvent.click(panel.getByRole("button", { exact: true, name: "Close" }));
    await expect.element(panel).not.toBeInTheDocument();
  });

  test("its footer's button closes it and returns focus to the trigger", async () => {
    const trigger = await renderSheet();
    await userEvent.click(trigger);
    await userEvent.click(panel.getByRole("button", { name: "Done" }));
    await expect.element(panel).not.toBeInTheDocument();
    await focusReturnsTo(trigger);
  });

  test("a click outside closes it", async () => {
    await userEvent.click(await renderSheet());
    await expect.element(panel).toBeVisible();
    await clickOutside("sheet-overlay");
    await expect.element(panel).not.toBeInTheDocument();
  });
});

describe("Drawer", () => {
  test("it is a dialog named by its title against the bottom edge, with a grip, and focus moves in", async () => {
    await userEvent.click(await renderDrawer());
    await expect.element(panel).toHaveAttribute("data-swipe-direction", "down");
    await focusIsIn(panel);
    expect(panel.element().querySelector('[data-slot="drawer-swipe-handle"]')).not.toBeNull();
    await expect.poll(() => Math.round(gapToEdge(panel.element(), "bottom"))).toBe(0);
  });

  test("swiped to the right, it stands against the right edge without a grip", async () => {
    const screen = await render(<DrawerExample direction="right" />);
    await userEvent.click(screen.getByRole("button", { name: "Drawer, right" }));
    await expect.element(panel).toHaveAttribute("data-swipe-direction", "right");
    expect(panel.element().querySelector('[data-slot="drawer-swipe-handle"]')).toBeNull();
    await expect.poll(() => Math.round(gapToEdge(panel.element(), "right"))).toBe(0);
  });

  test("Enter on the trigger opens it, and Escape closes it and returns focus to the trigger", async () => {
    const trigger = await renderDrawer();
    trigger.element().focus();
    await userEvent.keyboard("{Enter}");
    await focusIsIn(panel);
    await userEvent.keyboard("{Escape}");
    await expect.element(panel).not.toBeInTheDocument();
    await focusReturnsTo(trigger);
  });

  test("its footer's button closes it and returns focus to the trigger", async () => {
    const trigger = await renderDrawer();
    await userEvent.click(trigger);
    await userEvent.click(panel.getByRole("button", { name: "Done" }));
    await expect.element(panel).not.toBeInTheDocument();
    await focusReturnsTo(trigger);
  });

  test("a click outside closes it", async () => {
    await userEvent.click(await renderDrawer());
    await expect.element(panel).toBeVisible();
    await clickOutside("drawer-viewport");
    await expect.element(panel).not.toBeInTheDocument();
  });
});
