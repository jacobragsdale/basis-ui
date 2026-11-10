/* What the numbers and dates tests share: a token's computed colour, the dark mode, the compact density, where focus
 * is, and the month grid's days and keys. */

import { expect, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import type { Locator } from "vite-plus/test/browser";

/** A colour as the browser computes it, such as a token's `var(--gain)`, so it compares with a computed style. */
function computedColour(value: string): string {
  const probe = document.createElement("div");
  probe.style.color = value;
  document.body.append(probe);
  const { color } = getComputedStyle(probe);
  probe.remove();
  return color;
}

/** Runs `check` with the page in `mode`, then puts the light mode back. */
async function inMode(mode: "light" | "dark", check: () => Promise<void>): Promise<void> {
  document.documentElement.classList.toggle("dark", mode === "dark");
  try {
    await check();
  } finally {
    document.documentElement.classList.remove("dark");
  }
}

/** Runs `check` with the page in the compact density, then puts the comfortable density back. */
async function inCompactDensity(check: () => Promise<void>): Promise<void> {
  document.documentElement.dataset["density"] = "compact";
  try {
    await check();
  } finally {
    document.documentElement.dataset["density"] = "comfortable";
  }
}

/** Waits until focus is on what `locator` finds. */
async function focusIsOn(locator: Locator): Promise<void> {
  await expect.poll(() => document.activeElement).toBe(locator.element());
}

/** A day's button in an open month grid, by the start of its name, such as "Friday, October 30, 2026". */
function day(name: string): Locator {
  return page.getByRole("button", { name: new RegExp(`^${name}`, "u") });
}

/** Presses `keys` and waits for focus to land on the day whose name starts with `name`, and, when given, for the grid
 * to show `month`. */
async function keysTo(keys: string, name: string, month?: string): Promise<void> {
  await userEvent.keyboard(keys);
  await focusIsOn(day(name));
  if (month !== undefined) {
    await expect.element(page.getByRole("grid", { name: month })).toBeVisible();
  }
}

/** Runs `check` with today in New York as `first`, as the page is first drawn; the function `check` is given moves
 * today on, as midnight does to a page left open. */
async function withToday(
  first: string,
  check: (moveTo: (later: string) => void) => Promise<void>,
): Promise<void> {
  const now = vi
    .spyOn(Temporal.Now, "plainDateISO")
    .mockReturnValue(Temporal.PlainDate.from(first));
  try {
    await check((later) => {
      now.mockReturnValue(Temporal.PlainDate.from(later));
    });
  } finally {
    now.mockRestore();
  }
}

export { computedColour, day, focusIsOn, inCompactDensity, inMode, keysTo, withToday };
