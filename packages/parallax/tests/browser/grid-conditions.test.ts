/* A column's condition as the user types it, read as the column shows its values: in a column shown as a
 * percentage, 100 is 100%. Escape puts the box back, and leaving a box unchanged keeps the filter. */

import "@basis/ui/styles.css";

import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import type { LayoutInput } from "#layout/layout.ts";

import { pressAt, renderGrid } from "./grid-helpers.tsx";
import type { Rendered } from "./grid-helpers.tsx";

/** The market values shown as percentages: 100.5 is 10,050.00%. */
const asPercent: LayoutInput = { formats: { market_value: { percent: true } } };

/** Opens the market value column's menu and picks a condition, returning its value box. */
async function condition(
  { grid, screen }: Rendered,
  mode: string,
): Promise<ReturnType<Rendered["screen"]["getByRole"]>> {
  await pressAt(grid, { x: 40, y: 42 });
  await userEvent.keyboard("{ArrowRight}{ArrowRight}{Alt>}{ArrowDown}{/Alt}");
  const menu = screen.getByRole("dialog", { name: "Column market_value" });
  await menu.getByRole("combobox", { name: "Keep rows where" }).selectOptions(mode);
  return menu.getByRole("textbox", { name: "Value" });
}

/** Opens the desk column's menu and picks Contains, returning its value box. */
async function deskContains({
  grid,
  screen,
}: Rendered): Promise<ReturnType<Rendered["screen"]["getByRole"]>> {
  await pressAt(grid, { x: 40, y: 42 });
  await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
  const menu = screen.getByRole("dialog", { name: "Column desk" });
  await menu.getByRole("combobox", { name: "Keep rows where" }).selectOptions("Contains");
  return menu.getByRole("textbox", { name: "Value" });
}

describe("a column's condition", () => {
  test("reads what is typed as the column shows it", async () => {
    const rendered = await renderGrid({ layout: asPercent });
    const value = await condition(rendered, "At least");
    await value.fill("100");
    await userEvent.keyboard("{Enter}");
    // 100% is 1: four of the six market values are at least 1.
    await expect.poll(() => rendered.changes.at(-1)?.filters[0]?.value).toBe(1);
    await expect.element(rendered.grid).toHaveAttribute("aria-rowcount", "4");
  });

  test("is left as it was by leaving an empty box, and by Escape after typing", async () => {
    // The desks ticked in the value list: three rows.
    const ticked: LayoutInput = { filters: [{ column: "desk", op: "in", values: ["Rates"] }] };
    const rendered = await renderGrid({ layout: ticked }, "3");
    const value = await deskContains(rendered);
    await value.click();
    await userEvent.keyboard("{Tab}");
    await value.fill("Cred");
    await userEvent.keyboard("{Escape}");
    expect(rendered.changes).toStrictEqual([]);
    await expect.element(rendered.grid).toHaveAttribute("aria-rowcount", "3");
  });
});
