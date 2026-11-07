import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import type { Locator } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { computedColour, focusIsIn, focusReturnsTo, inCompactDensity } from "./helpers.ts";
import { ContextMenuExample, DropdownMenuExample } from "./menus.tsx";

const menu = page.getByRole("menu");

/** An item of the open menu, by its name; a name with a shortcut after it runs straight on, as in "EditCtrl+E". */
function item(name: string | RegExp): Locator {
  return page.getByRole("menuitem", { name });
}

/** Renders the dropdown menu and returns its trigger. */
async function renderDropdownMenu(): Promise<Locator> {
  const screen = await render(<DropdownMenuExample />);
  return screen.getByRole("button", { name: "Actions" });
}

/** Renders the dropdown menu and opens it from the keyboard, with focus on its trigger. */
async function openDropdownMenuByKeyboard(): Promise<Locator> {
  const trigger = await renderDropdownMenu();
  trigger.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(menu).toBeVisible();
  return trigger;
}

describe("Dropdown Menu", () => {
  test("its trigger says it opens a menu, and a click opens it with focus inside", async () => {
    const trigger = await renderDropdownMenu();
    await expect.element(trigger).toHaveAttribute("aria-haspopup", "menu");
    await userEvent.click(trigger);
    await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
    await expect.element(menu.getByRole("group", { name: "Position" })).toBeVisible();
    await expect.element(item(/^Edit/u)).toBeVisible();
    await focusIsIn(menu);
  });

  test("Enter on the trigger opens it on its first item, and the arrow keys move through the items", async () => {
    await openDropdownMenuByKeyboard();
    await expect.element(item(/^Edit/u)).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(item(/^Duplicate/u)).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    await expect.element(item(/^Edit/u)).toHaveFocus();
  });

  test("End and Home move to the last item and the first", async () => {
    await openDropdownMenuByKeyboard();
    await userEvent.keyboard("{End}");
    await expect.element(item("Delete")).toHaveFocus();
    await userEvent.keyboard("{Home}");
    await expect.element(item(/^Edit/u)).toHaveFocus();
  });

  test("Escape closes it and returns focus to the trigger", async () => {
    const trigger = await openDropdownMenuByKeyboard();
    await userEvent.keyboard("{Escape}");
    await expect.element(menu).not.toBeInTheDocument();
    await focusReturnsTo(trigger);
  });

  test("Enter on an item runs it, which closes the menu and returns focus to the trigger", async () => {
    const trigger = await openDropdownMenuByKeyboard();
    await expect.element(item(/^Edit/u)).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect.element(menu).not.toBeInTheDocument();
    await focusReturnsTo(trigger);
  });

  test("the right arrow opens a submenu on its first item, and the left arrow closes it", async () => {
    await openDropdownMenuByKeyboard();
    const moveTo = item("Move to");
    await expect.element(moveTo).toHaveAttribute("aria-haspopup", "menu");
    moveTo.element().focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(item("Core Plus")).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(item("Core Plus")).not.toBeInTheDocument();
    await expect.element(moveTo).toHaveFocus();
  });
});

describe("Dropdown Menu's items", () => {
  test("a checkbox item toggles, and the menu stays open", async () => {
    await userEvent.click(await renderDropdownMenu());
    const spread = page.getByRole("menuitemcheckbox", { name: "Spread" });
    await expect.element(page.getByRole("menuitemcheckbox", { name: "Yield" })).toBeChecked();
    await expect.element(spread).not.toBeChecked();
    await userEvent.click(spread);
    await expect.element(spread).toBeChecked();
    await expect.element(menu).toBeVisible();
  });

  test("a radio item in a labelled group chooses one option, and the menu stays open", async () => {
    await userEvent.click(await renderDropdownMenu());
    const clean = page.getByRole("menuitemradio", { name: "Clean" });
    const dirty = page.getByRole("menuitemradio", { name: "Dirty" });
    await expect.element(page.getByRole("group", { name: "Price" })).toBeVisible();
    await expect.element(clean).toBeChecked();
    await userEvent.click(dirty);
    await expect.element(dirty).toBeChecked();
    await expect.element(clean).not.toBeChecked();
    await expect.element(menu).toBeVisible();
  });

  test("a disabled item is marked disabled", async () => {
    await userEvent.click(await renderDropdownMenu());
    await expect.element(item("Export to Excel")).toHaveAttribute("aria-disabled", "true");
  });

  test("the destructive item is the destructive colour, on its tint when highlighted", async () => {
    await userEvent.click(await renderDropdownMenu());
    const remove = item("Delete");
    remove.element().focus();
    await expect.element(remove).toHaveFocus();
    expect(getComputedStyle(remove.element()).color).toBe(computedColour("var(--destructive)"));
    await expect
      .poll(() => getComputedStyle(remove.element()).backgroundColor)
      .toBe(computedColour("var(--destructive-subtle)"));
  });

  test("its items stay at least 24 px tall in the compact density, WCAG 2.2's minimum target", async () => {
    await inCompactDensity(async () => {
      await userEvent.click(await renderDropdownMenu());
      const heights = page
        .getByRole("menuitem")
        .all()
        .map((each) => each.element().getBoundingClientRect().height);
      expect(heights.length).toBeGreaterThan(0);
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(24);
    });
  });
});

/** Renders the context menu and returns the button it opens on. */
async function renderContextMenu(): Promise<Locator> {
  const screen = await render(<ContextMenuExample />);
  return screen.getByRole("button", { name: "UST 4.25% 2034, 5,000,000 par" });
}

describe("Context Menu", () => {
  test("a right click on its trigger opens a menu at the pointer, with focus inside", async () => {
    const trigger = await renderContextMenu();
    const row = trigger.element();
    const { left, top } = row.getBoundingClientRect();
    await userEvent.click(row, { button: "right", position: { x: 20, y: 20 } });
    await expect.element(menu.getByRole("group", { name: "Row" })).toBeVisible();
    await focusIsIn(menu);
    const box = menu.element().getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(left + 20);
    expect(box.top).toBeGreaterThanOrEqual(top + 20);
  });

  test("the arrow keys move through its items", async () => {
    await userEvent.click(await renderContextMenu(), { button: "right" });
    await expect.element(menu).toBeVisible();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(item(/^Copy/u)).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(item("Edit")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(item("Edit")).toHaveFocus();
  });

  test("the right arrow opens a submenu, and Escape closes the submenu, then the menu", async () => {
    await userEvent.click(await renderContextMenu(), { button: "right" });
    await expect.element(menu).toBeVisible();
    item("Group by").element().focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(item("Sector")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect.element(item("Sector")).not.toBeInTheDocument();
    await expect.element(item("Group by")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect.element(menu).not.toBeInTheDocument();
  });

  test("Shift+F10 on the focused trigger opens it, and Escape returns focus to the trigger", async () => {
    const row = await renderContextMenu();
    row.element().focus();
    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    await expect.element(menu).toBeVisible();
    await focusIsIn(menu);
    await userEvent.keyboard("{Escape}");
    await expect.element(menu).not.toBeInTheDocument();
    await focusReturnsTo(row);
  });
});
