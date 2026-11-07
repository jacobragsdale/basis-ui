import "#styles.css";

import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import type { Locator } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { CommandDialogExample, CommandExample } from "./command.tsx";
import { computedColour, focusReturnsTo, inMode } from "./helpers.ts";

/** The names of the options the list shows. */
function shown(): string[] {
  return page
    .getByRole("option")
    .all()
    .map((option) => option.element().textContent);
}

describe("Command", () => {
  test("its input is a combobox and its list a listbox, both named by the Command's label", async () => {
    const screen = await render(<CommandExample onRun={vi.fn<(value: string) => void>()} />);
    const input = screen.getByRole("combobox", { name: "Go to or run" });
    await expect.element(input).toHaveAttribute("placeholder", "Type a command or search...");
    const list = screen.getByRole("listbox", { name: "Go to or run" });
    await expect.element(input).toHaveAttribute("aria-controls", list.element().id);
    await expect.element(list.getByRole("group", { name: "Go to" })).toBeVisible();
    expect(shown()).toStrictEqual([
      "Positions",
      "Trades",
      "Risk",
      "Archive",
      "ProfileCtrl+P",
      "Settings",
    ]);
  });

  test("the list narrows as the user types, matching anywhere in an item and ignoring case, and hides emptied groups", async () => {
    const screen = await render(<CommandExample onRun={vi.fn<(value: string) => void>()} />);
    const input = screen.getByRole("combobox", { name: "Go to or run" });
    await userEvent.type(input, "RA");
    await expect.poll(shown).toStrictEqual(["Trades"]);
    await expect.element(screen.getByRole("group", { name: "Go to" })).toBeVisible();
    await expect.element(screen.getByRole("group", { name: "Settings" })).not.toBeInTheDocument();
    await userEvent.clear(input);
    await expect.poll(shown).toHaveLength(6);
  });

  test("an item matches its keywords, and not its shortcut", async () => {
    const screen = await render(<CommandExample onRun={vi.fn<(value: string) => void>()} />);
    const input = screen.getByRole("combobox", { name: "Go to or run" });
    await userEvent.type(input, "theme");
    await expect.poll(shown).toStrictEqual(["Settings"]);
    await userEvent.clear(input);
    await userEvent.type(input, "ctrl");
    await expect.poll(shown).toStrictEqual([]);
  });

  test("when nothing matches, it says so in a live region outside the listbox", async () => {
    const screen = await render(<CommandExample onRun={vi.fn<(value: string) => void>()} />);
    const empty = screen.getByRole("status");
    await expect.element(empty).toHaveTextContent("");
    await userEvent.type(screen.getByRole("combobox", { name: "Go to or run" }), "zzz");
    await expect.element(empty).toHaveTextContent("No results found.");
    expect(screen.getByRole("listbox").element().contains(empty.element())).toBe(false);
  });

  test("Enter runs the first match, and the search stays", async () => {
    const run = vi.fn<(value: string) => void>();
    const screen = await render(<CommandExample onRun={run} />);
    const input = screen.getByRole("combobox", { name: "Go to or run" });
    await userEvent.type(input, "ris");
    await expect.poll(shown).toStrictEqual(["Risk"]);
    await userEvent.keyboard("{Enter}");
    expect(run).toHaveBeenCalledExactlyOnceWith("Risk");
    await expect.element(input).toHaveValue("ris");
  });

  test("the first item starts highlighted, and the arrow keys move the highlight while focus stays in the input", async () => {
    const screen = await render(<CommandExample onRun={vi.fn<(value: string) => void>()} />);
    const input = screen.getByRole("combobox", { name: "Go to or run" });
    await userEvent.click(input);
    await expect
      .element(screen.getByRole("option", { name: "Positions" }))
      .toHaveAttribute("data-highlighted");
    await userEvent.keyboard("{ArrowDown}");
    const trades = screen.getByRole("option", { name: "Trades" });
    await expect.element(trades).toHaveAttribute("data-highlighted");
    await expect.element(input).toHaveAttribute("aria-activedescendant", trades.element().id);
    await expect.element(input).toHaveFocus();
  });

  test.each(["light", "dark"] as const)(
    "in the %s mode the highlighted item stands out from the list",
    async (mode) => {
      await inMode(mode, async () => {
        const screen = await render(<CommandExample onRun={vi.fn<(value: string) => void>()} />);
        await userEvent.click(screen.getByRole("combobox", { name: "Go to or run" }));
        const option = screen.getByRole("option", { name: "Positions" });
        await expect.element(option).toHaveAttribute("data-highlighted");
        await expect
          .poll(() => getComputedStyle(option.element()).backgroundColor)
          .toBe(computedColour("var(--accent)"));
        expect(computedColour("var(--accent)")).not.toBe(computedColour("var(--popover)"));
      });
    },
  );

  test("Enter runs the highlighted item", async () => {
    const run = vi.fn<(value: string) => void>();
    const screen = await render(<CommandExample onRun={run} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Go to or run" }));
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(run).toHaveBeenCalledExactlyOnceWith("Risk");
  });

  test("a click runs an item", async () => {
    const run = vi.fn<(value: string) => void>();
    const screen = await render(<CommandExample onRun={run} />);
    await userEvent.click(screen.getByRole("option", { name: "Settings" }));
    expect(run).toHaveBeenCalledExactlyOnceWith("Settings");
  });

  test("a disabled item does not run", async () => {
    const run = vi.fn<(value: string) => void>();
    const screen = await render(<CommandExample onRun={run} />);
    await userEvent.type(screen.getByRole("combobox", { name: "Go to or run" }), "arch");
    const archive = screen.getByRole("option", { name: "Archive" });
    await expect.element(archive).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Enter}");
    expect(run).not.toHaveBeenCalled();
  });
});

/** Renders the command palette, opens it from its trigger, and returns the trigger once focus is in the search. */
async function openPalette(onRun: (value: string) => void): Promise<Locator> {
  const screen = await render(<CommandDialogExample onRun={onRun} />);
  const trigger = screen.getByRole("button", { name: "Command palette" });
  await userEvent.click(trigger);
  await expect.element(page.getByRole("combobox", { name: "Go to or run" })).toHaveFocus();
  return trigger;
}

describe("Command Dialog", () => {
  test("its trigger opens a dialog named by its title with focus in the search, and Escape closes it", async () => {
    const trigger = await openPalette(vi.fn<(value: string) => void>());
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    await expect.element(dialog).toHaveAccessibleDescription("Search for a command to run...");
    await userEvent.keyboard("{Escape}");
    await expect.element(dialog).not.toBeInTheDocument();
    await focusReturnsTo(trigger);
  });

  test("typing filters it and Enter runs the command, which closes it and returns focus to the trigger", async () => {
    const run = vi.fn<(value: string) => void>();
    const trigger = await openPalette(run);
    await userEvent.keyboard("pos");
    await expect.poll(shown).toStrictEqual(["Positions"]);
    await userEvent.keyboard("{Enter}");
    expect(run).toHaveBeenCalledExactlyOnceWith("Positions");
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await focusReturnsTo(trigger);
  });
});
