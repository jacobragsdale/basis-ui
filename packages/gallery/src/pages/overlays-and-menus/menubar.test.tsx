import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { focusIsIn, focusReturnsTo, inCompactDensity } from "./helpers.ts";
import { MenubarExample } from "./menubar.tsx";

const menus = ["File", "Edit", "View"] as const;

describe("Menubar", () => {
  test.each(menus)(
    "it is a menubar, and the %s menu's trigger is named by its text",
    async (name) => {
      const screen = await render(<MenubarExample />);
      const bar = screen.getByRole("menubar");
      await expect.element(bar).toBeVisible();
      await expect
        .element(bar.getByRole("menuitem", { name }))
        .toHaveAttribute("aria-haspopup", "menu");
    },
  );

  test("a click opens a menu with focus inside, and Escape closes it and returns focus to its trigger", async () => {
    const screen = await render(<MenubarExample />);
    const file = screen.getByRole("menuitem", { name: "File" });
    await userEvent.click(file);
    const menu = page.getByRole("menu");
    await expect.element(menu.getByRole("menuitem", { name: /^New view/u })).toBeVisible();
    await focusIsIn(menu);
    await userEvent.keyboard("{Escape}");
    await expect.element(menu).not.toBeInTheDocument();
    await focusReturnsTo(file);
  });

  test("the arrow keys move between the triggers", async () => {
    const screen = await render(<MenubarExample />);
    screen.getByRole("menuitem", { name: "File" }).element().focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(screen.getByRole("menuitem", { name: "View" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
  });

  test("the down arrow opens a menu on its first item, and moves on past a disabled one", async () => {
    const screen = await render(<MenubarExample />);
    screen.getByRole("menuitem", { name: "File" }).element().focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    const menu = page.getByRole("menu");
    await expect.element(menu.getByRole("menuitem", { name: /^Undo/u })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await expect.element(menu.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
  });

  test("with a menu open, the arrow keys open the next menu", async () => {
    const screen = await render(<MenubarExample />);
    await userEvent.click(screen.getByRole("menuitem", { name: "File" }));
    await expect.element(page.getByRole("menuitem", { name: /^New view/u })).toBeVisible();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(page.getByRole("menuitem", { name: /^Undo/u })).toBeVisible();
    await expect
      .element(page.getByRole("menuitem", { name: /^New view/u }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("menuitem", { name: "Edit" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  test("its checkbox and radio items are marked checked", async () => {
    const screen = await render(<MenubarExample />);
    await userEvent.click(screen.getByRole("menuitem", { name: "View" }));
    await expect.element(page.getByRole("menuitemcheckbox", { name: "Grid lines" })).toBeChecked();
    await expect.element(page.getByRole("menuitemcheckbox", { name: "Totals" })).not.toBeChecked();
    await expect.element(page.getByRole("menuitemradio", { name: "Comfortable" })).toBeChecked();
    await userEvent.click(page.getByRole("menuitemradio", { name: "Compact" }));
    await expect.element(page.getByRole("menuitemradio", { name: "Compact" })).toBeChecked();
  });

  test("its triggers stay at least 24 px across in the compact density, WCAG 2.2's minimum target", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<MenubarExample />);
      const boxes = menus.map((name) =>
        screen.getByRole("menuitem", { name }).element().getBoundingClientRect(),
      );
      expect(Math.min(...boxes.map((box) => box.height))).toBeGreaterThanOrEqual(24);
      expect(Math.min(...boxes.map((box) => box.width))).toBeGreaterThanOrEqual(24);
    });
  });
});
