import "#styles.css";

import { DataTable, applyPreferences } from "@basis/ui";
import type { Preferences } from "@basis/ui";
import type { ReactElement } from "react";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { cdp, page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import { z } from "zod";

import { positionColumns } from "#pages/data/columns.tsx";
import { positions } from "#pages/data/fixtures.ts";
import type { Position } from "#pages/data/fixtures.ts";
import { DialogExample } from "#pages/overlays-and-menus/dialogs.tsx";

/* The main thread's budget, with the CPU slowed four times through DevTools, as spike 0.3's proxy for a Citrix
 * desktop: what `DataTable` at its row cap, a dialog opening and a change of mode cost, as long animation frames, the
 * frames whose work took over 50 ms. Each budget is the count of such frames and their longest, set from measurement
 * on the build host, an 8-core Ryzen 7 8745HS, on 2026-11-09, alone and beside the rest of the gallery's suite, while
 * other agents' builds and tests shared the host (a load average of 6 to 8). The counts held steady; the longest
 * frames varied up to twice over, so their budgets are about twice the worst seen. A change that adds frames, or makes
 * one much longer, fails here. */

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

/** The positions at the row cap, with selection and the column menus on, as a desk's blotter would have them. */
function CappedTable(): ReactElement {
  return (
    <DataTable
      label="Positions"
      columns={positionColumns}
      data={capped}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.cusip}
      selectable
    />
  );
}

const light: Preferences = { density: "comfortable", mode: "light", motion: "full" };

/** `spent`, with each figure over its budget replaced by a line that names the figure and the budget, so a failure
 * says which budget it broke. */
function within(spent: Cost, budget: Cost): Record<keyof Cost, number | string> {
  const shown = (name: keyof Cost): number | string =>
    spent[name] <= budget[name]
      ? spent[name]
      : `${String(spent[name])}, over its budget of ${String(budget[name])}`;
  return { longFrames: shown("longFrames"), longest: shown("longest") };
}

describe("the main thread, with the CPU slowed four times", () => {
  beforeAll(async () => {
    await cdp().send("Emulation.setCPUThrottlingRate", { rate: slowdown });
  });
  afterAll(async () => {
    await cdp().send("Emulation.setCPUThrottlingRate", { rate: 1 });
    applyPreferences(document.documentElement, light, false);
  });

  test("DataTable at its row cap", async () => {
    const spent = await cost(async () => {
      const screen = await render(<CappedTable />);
      await expect.element(screen.getByRole("table")).toBeVisible();
    });
    /* Measured: 2 long frames, the longest 3.9 to 4.7 s alone and up to 8.3 s beside the rest of the suite, as React
     * renders 2,000 rows and the browser lays them out. */
    expect(within(spent, { longFrames: 3, longest: 16_000 })).toStrictEqual(spent);
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

  test("a change of mode, over the table at its row cap", async () => {
    const screen = await render(<CappedTable />);
    await expect.element(screen.getByRole("table")).toBeVisible();
    await frames(2);
    const spent = await cost(async () => {
      applyPreferences(document.documentElement, { ...light, mode: "dark" }, false);
      await frames(3);
    });
    /* Measured: 4 long frames, the longest 3.1 to 4.1 s, restyling the table's tens of thousands of elements; with
     * transitions left on, 5, the longest 3.9 s. */
    expect(within(spent, { longFrames: 6, longest: 8000 })).toStrictEqual(spent);
  });
});
