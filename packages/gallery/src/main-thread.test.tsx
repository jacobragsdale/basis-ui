import "#styles.css";

import { DataTable, applyPreferences } from "@basis/ui";
import type { DataTableRowAction, Preferences } from "@basis/ui";
import type { ReactElement } from "react";
import { afterAll, beforeAll, describe, expect, inject, test } from "vite-plus/test";
import { cdp, page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import { z } from "zod";

import { positionColumns } from "#pages/data/columns.tsx";
import { positions } from "#pages/data/fixtures.ts";
import type { Position } from "#pages/data/fixtures.ts";
import { DialogExample } from "#pages/overlays-and-menus/dialogs.tsx";

/* The main thread's budget, with the CPU slowed four times through DevTools, as spike 0.3's proxy for a Citrix
 * desktop: what `DataTable` at its row cap, a dialog opening, a key in the table's filter and a change of mode over it
 * cost, as long animation frames, the frames whose work took over 50 ms. Each budget is the count of such frames and
 * their longest, set from measurement on the build host, an 8-core Ryzen 7 8745HS, alone and beside the rest of the
 * gallery's suite, while other agents' builds and tests shared the host: the dialog's on 2026-11-09 (step 6.2c), the
 * table's on 2026-11-10 (step 6.7.3), at a load average of 2 to 5. The counts held steady; the longest frames varied up
 * to twice over, so their budgets are about twice the worst seen. A change that adds frames, or makes one much longer,
 * fails here. Step 6.7.3's target was no frame over 200 ms: a key and a change of mode meet it alone, and the first
 * render, which runs the table's code for the first time, does not (PLAN.md, "Found while building").
 *
 * GitHub's runners are slower and shared: in CI the counts hold as they are, and the longest frame meets a ceiling of
 * `ciSlack` times its budget, which a host's run measures and CI only bounds. */

declare module "vite-plus/test" {
  interface ProvidedContext {
    /** Whether the tests run in CI: the gallery's config provides it. */
    readonly ci: boolean;
  }
}

/** How many times its budget a frame may take on a CI runner. */
const ciSlack = 4;
/** Each test's timeout: under the slowdown, a CI runner spent 39 s rendering the table at its cap before it paged. */
const slowTimeout = 120_000;

const slowdown = 4;
const rowCap = 2000;

interface Cost {
  /** Long animation frames: frames whose work took over 50 ms. */
  readonly longFrames: number;
  /** The longest of them, in milliseconds, or 0. */
  readonly longest: number;
}

/** The test runner's own window, which the tests' frame shares an event loop with. Chromium reports long animation
 * frames to the top window alone, for every frame of its origin, so the tests' frame observes through it. */
function topObserver(): typeof PerformanceObserver {
  const top = globalThis.top ?? globalThis;
  return z
    .custom<typeof PerformanceObserver>((value) => typeof value === "function")
    .parse(Reflect.get(top, "PerformanceObserver"));
}

/** Waits for the next frame. */
async function nextFrame(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<number>();
  requestAnimationFrame(resolve);
  await promise;
}

/** Waits for `count` frames, one after another. */
async function frames(count: number): Promise<void> {
  if (count > 0) {
    await nextFrame();
    await frames(count - 1);
  }
}

/** Waits `ms` milliseconds. */
async function pause(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  setTimeout(resolve, ms);
  await promise;
}

/** What `run` costs the main thread, as the long animation frames from its start to two frames after it ends. */
async function cost(run: () => Promise<void>): Promise<Cost> {
  const durations: number[] = [];
  const Observer = topObserver();
  const observer = new Observer((list) => {
    durations.push(...list.getEntries().map((entry) => entry.duration));
  });
  observer.observe({ type: "long-animation-frame" });
  await run();
  await frames(2);
  // The observer is told of a frame after it ends.
  await pause(100);
  durations.push(...observer.takeRecords().map((entry) => entry.duration));
  observer.disconnect();
  return { longFrames: durations.length, longest: Math.round(Math.max(0, ...durations)) };
}

/** `rowCap` positions, each with its own id. */
const capped: readonly Position[] = Array.from(
  { length: rowCap },
  (_unused, index) => index,
).flatMap((index) => {
  const position = positions[index % positions.length];
  return position === undefined ? [] : [{ ...position, id: `p${String(index)}` }];
});

/** What an action does here: the test never runs one. */
function nothing(): void {
  // The menu is never opened.
}

/** A position's actions, as a desk's table lists them. */
function actionsFor(row: Position): readonly DataTableRowAction[] {
  return [
    { label: "View position", onSelect: nothing },
    { disabled: !row.settled, label: "Close position", onSelect: nothing },
  ];
}

/** The positions at the row cap, with selection, the column menus and each row's actions on, as a desk's table would
 * have them, 50 rows a page, its default. */
function CappedTable(): ReactElement {
  return (
    <DataTable
      label="Positions"
      columns={positionColumns}
      data={capped}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.cusip}
      selectable
      rowActions={actionsFor}
    />
  );
}

/** Runs the test runner's own first render, query and key, so the first test measures the page and not the runner:
 * its locators and its keyboard run for the first time otherwise inside the frame measured. */
async function warmTheRunner(): Promise<void> {
  const screen = await render(<input aria-label="Warm" />);
  await userEvent.type(screen.getByRole("textbox", { name: "Warm" }), "a");
  await expect.element(screen.getByRole("textbox", { name: "Warm" })).toHaveValue("a");
  await screen.unmount();
}

const light: Preferences = {
  density: "comfortable",
  mode: "light",
  motion: "full",
  theme: "default",
};

/** `spent`, with each figure over its budget replaced by a line that names the figure and the budget, so a failure
 * says which budget it broke. */
function within(spent: Cost, budget: Cost): Record<keyof Cost, number | string> {
  const ceiling: Cost = inject("ci") ? { ...budget, longest: budget.longest * ciSlack } : budget;
  const shown = (name: keyof Cost): number | string =>
    spent[name] <= ceiling[name]
      ? spent[name]
      : `${String(spent[name])}, over its budget of ${String(ceiling[name])}`;
  return { longFrames: shown("longFrames"), longest: shown("longest") };
}

describe("the main thread, with the CPU slowed four times", { timeout: slowTimeout }, () => {
  beforeAll(async () => {
    await cdp().send("Emulation.setCPUThrottlingRate", { rate: slowdown });
  });
  afterAll(async () => {
    await cdp().send("Emulation.setCPUThrottlingRate", { rate: 1 });
    applyPreferences(document.documentElement, light, false);
  });

  test("DataTable at its row cap", async () => {
    await warmTheRunner();
    const spent = await cost(async () => {
      const screen = await render(<CappedTable />);
      await expect.element(screen.getByRole("table")).toBeVisible();
    });
    /* Measured: 1 or 2 long frames, the longest 267 to 346 ms alone and 505 to 563 ms beside the rest of the suite, as
     * React draws the first page of 50 rows and runs the table's code for the first time; later tables take 130 to
     * 180 ms. Before step 6.7.3 drew pages, it drew all 2,000 rows: 2 frames, the longest 3.9 to 8.3 s. */
    expect(within(spent, { longFrames: 3, longest: 1200 })).toStrictEqual(spent);
  });

  test("a dialog opening", async () => {
    const screen = await render(<DialogExample />);
    await frames(2);
    const spent = await cost(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Edit position" }));
      await expect.element(page.getByRole("dialog", { name: "Edit position" })).toBeVisible();
      // The popup's fade, 100 ms, and a frame either side.
      await pause(200);
    });
    // Measured: 1 long frame, of 54 to 80 ms, the frame that mounts the dialog.
    expect(within(spent, { longFrames: 2, longest: 250 })).toStrictEqual(spent);
  });

  test("a key in the filter of the table at its row cap", async () => {
    const screen = await render(<CappedTable />);
    const filter = screen.getByRole("searchbox", { name: "Filter Positions" });
    await expect.element(filter).toBeVisible();
    await frames(2);
    const spent = await cost(async () => {
      await userEvent.type(filter, "a");
      // The table filters once typing pauses, 200 ms, and draws the rows the filter keeps.
      await expect.element(screen.getByText("Rows 1–50 of 1,502")).toBeVisible();
      await pause(300);
    });
    /* Measured: 1 or 2 long frames, the longest 96 to 159 ms alone and 206 to 213 ms beside the rest of the suite, the
     * frame that filters the 2,000 rows by the text their cells show and draws the page they leave. Before step 6.7.3,
     * every key drew every row again: 1.0 to 1.4 s a key. */
    expect(within(spent, { longFrames: 3, longest: 450 })).toStrictEqual(spent);
  });

  test("a change of mode, over the table at its row cap", async () => {
    const screen = await render(<CappedTable />);
    await expect.element(screen.getByRole("table")).toBeVisible();
    await frames(2);
    const spent = await cost(async () => {
      applyPreferences(document.documentElement, { ...light, mode: "dark" }, false);
      await frames(3);
    });
    /* Measured: 1 or 2 long frames, the longest 146 to 171 ms alone and 66 to 213 ms beside the rest of the suite,
     * restyling the page of 50 rows. Before step 6.7.3, 4 frames, the longest 3.1 to 4.1 s, restyling all 2,000. */
    expect(within(spent, { longFrames: 3, longest: 450 })).toStrictEqual(spent);
  });
});
