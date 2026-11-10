import "@basis/ui/styles.css";

import type { ReactNode } from "react";
import { describe, expect, onTestFinished, test, vi } from "vite-plus/test";
import { cdp } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { DevicePixels } from "#canvas/device-pixels.ts";
import { Chart } from "#chart/chart.tsx";
import { Grid } from "#grid/grid.tsx";
import { metricsOf } from "#grid/paint/metrics.ts";
import { ParallaxProvider } from "#react/provider.tsx";
import { useDataset } from "#react/use-dataset.ts";
import { readTheme } from "#theme/read.ts";

import { exposures } from "./chart-data.ts";
import { summaryOf } from "./chart-reads.ts";
import { positionsBytes, startWorker } from "./data.ts";
import {
  deviceBox,
  fills,
  gapBetweenBars,
  heardQueries,
  inkByRow,
  painted,
  ruleThickness,
  strip,
} from "./device-pixel-reads.ts";
import { renderPivot } from "./pivot-helpers.tsx";

/* These tests run at the ratio of each browser project: 1, and 1.25 and 1.5 in the projects that start Chromium at
 * those ratios, as Windows' 125 % and 150 % scaling do. At 1 they hold trivially; at the others a canvas sized in CSS
 * pixels is resampled and its one-pixel rules blur. */

/** A container that is not on whole device pixels: half a CSS pixel down the page, and 531 by 601 CSS pixels, which
 * are fractions of device pixels at 1.25 and 1.5, 663.75 by 751.25 at 1.25. */
function offsetContainer(): HTMLElement {
  const [outer, inner] = [document.createElement("div"), document.createElement("div")];
  outer.style.paddingTop = "0.5px";
  Object.assign(inner.style, { height: "531px", width: "601px" });
  outer.append(inner);
  document.body.append(outer);
  onTestFinished(() => {
    outer.remove();
  });
  return inner;
}

function PositionsGrid(): ReactNode {
  const positions = useDataset("positions", positionsBytes);
  return <Grid dataset={positions} layout={{}} />;
}

/** The parts of a CSS pixel layout keeps a size to. */
const layoutUnits = 64;

/** Expects the canvas's backing store to be its box in device pixels, so that nothing resamples it, and its CSS size
 * to be whole device pixels, as near as layout keeps it. */
async function expectWholeDevicePixels(canvas: HTMLCanvasElement): Promise<void> {
  await expect
    .poll(async () => {
      const [width, height] = await deviceBox(canvas);
      return [canvas.width - width, canvas.height - height];
    })
    .toStrictEqual([0, 0]);
  const ratio = globalThis.devicePixelRatio;
  const { width, height } = canvas.getBoundingClientRect();
  for (const css of [width, height]) {
    // Layout keeps a size to a 64th of a CSS pixel.
    const device = css * ratio;
    expect(Math.abs(device - Math.round(device))).toBeLessThanOrEqual(ratio / layoutUnits);
  }
}

/** Expects the grid's header, its rule and its first row to fill whole device pixels, down a column of the first
 * cell's padding, with the header's rule a whole number of device pixels thick. */
function expectCrispHeader(canvas: HTMLCanvasElement): void {
  const theme = readTheme(canvas);
  const ratio = globalThis.devicePixelRatio;
  const { headerPx, rowPx } = metricsOf(theme);
  const colours = strip(canvas, Math.floor(2 * ratio), [0, Math.ceil((headerPx + rowPx) * ratio)]);
  const allowed = fills(
    theme,
    ["background", "stripe", "headerBackground", "groupBackground", "totalBackground"],
    ["headerBorder", "rowBorder", "columnBorder", "totalBorder", "borderColor"],
  );
  expect(colours.filter((colour) => !allowed.has(colour))).toStrictEqual([]);
  const rule = painted(theme.headerBorder, theme.headerBackground);
  expect(colours.filter((colour) => colour === rule)).toHaveLength(ruleThickness());
}

/** Expects the chart's gridlines and baseline to fill whole device pixels down a column between its first two bars,
 * each gridline a whole number of device pixels thick. */
function expectCrispGridlines(canvas: HTMLCanvasElement): void {
  const theme = readTheme(canvas);
  const [left, bottom] = gapBetweenBars(canvas);
  const colours = strip(canvas, left, [0, bottom]);
  const allowed = fills(theme, ["background"], ["gridline", "borderColor"]);
  expect(colours.filter((colour) => !allowed.has(colour))).toStrictEqual([]);
  const gridline = painted(theme.gridline, theme.background);
  const thick = colours.filter((colour) => colour === gridline).length;
  expect(thick).toBeGreaterThan(ruleThickness());
  expect(thick % ruleThickness()).toBe(0);
}

/** How many device pixels a backing store `device` wide is short of `css` CSS pixels at `ratio`, either way. */
function shortBy(css: number, device: number, ratio: number): number {
  return Math.abs(Math.round(css * ratio - device));
}

/** The canvas of a grid of the positions in an offset container, once its rows have arrived. */
async function gridCanvas(): Promise<HTMLCanvasElement> {
  const screen = await render(
    <ParallaxProvider worker={startWorker}>
      <PositionsGrid />
    </ParallaxProvider>,
    { container: offsetContainer() },
  );
  const grid = screen.getByRole("grid");
  await expect.element(grid).toHaveAttribute("aria-rowcount", "6");
  const canvas = grid.element().querySelector("canvas");
  if (canvas === null) {
    throw new Error("The grid has no canvas.");
  }
  return canvas;
}

describe("a canvas on whole device pixels", () => {
  test("a grid's backing store is its box in device pixels, and its header's rule is crisp", async () => {
    const canvas = await gridCanvas();
    await expectWholeDevicePixels(canvas);
    expectCrispHeader(canvas);
  });

  test.runIf(globalThis.devicePixelRatio === 1)(
    "a grid draws at a ratio that is only emulated, whose box Chromium reports in CSS pixels",
    async () => {
      // As Playwright's deviceScaleFactor and DevTools' device mode emulate one, and the scale harness measures.
      const emulated = 1.5;
      const session = cdp();
      const metrics = { deviceScaleFactor: emulated, height: 0, mobile: false, width: 0 };
      await session.send("Emulation.setDeviceMetricsOverride", metrics);
      onTestFinished(async () => {
        await session.send("Emulation.clearDeviceMetricsOverride");
      });
      const canvas = await gridCanvas();
      await expect
        .poll(() => {
          const { width, height } = canvas.getBoundingClientRect();
          return [shortBy(width, canvas.width, emulated), shortBy(height, canvas.height, emulated)];
        })
        .toStrictEqual([0, 0]);
    },
  );

  test("so is a pivot's", async () => {
    const { grid } = await renderPivot();
    const canvas = grid.element().querySelector("canvas");
    if (canvas === null) {
      throw new Error("The pivot has no canvas.");
    }
    await expectWholeDevicePixels(canvas);
    expectCrispHeader(canvas);
  });

  test("a chart's backing store is its box in device pixels, and its gridlines are crisp", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Chart rows={exposures} kind="bar" x="sector" y="exposure" className="h-full w-full" />
      </ParallaxProvider>,
      { container: offsetContainer() },
    );
    await expect.poll(() => summaryOf(screen.container)).toBe("3 groups");
    const canvas = screen.container.querySelector("canvas");
    if (canvas === null) {
      throw new Error("The chart has no canvas.");
    }
    await expectWholeDevicePixels(canvas);
    expectCrispGridlines(canvas);
  });

  test("puts text on whole device pixels without help: Chromium rounds a glyph's baseline to one", () => {
    // So the painters leave a text's y as it is: rounding it first would only move the text at a ratio of 1.
    const whole = inkByRow(15);
    for (const fraction of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const rows = inkByRow(15 + fraction);
      const shifts = [0, 1, 2].filter((shift) =>
        rows.every((ink, row) => ink === (whole[row - shift] ?? 0)),
      );
      expect(shifts, `text at 15 + ${String(fraction)}`).toHaveLength(1);
    }
  });

  test("sizes again when the ratio changes, and listens at the new one", () => {
    const { asked, listeners } = heardQueries();
    const changed = vi.fn<() => void>();
    const device = new DevicePixels(document.createElement("canvas"), changed);
    onTestFinished(() => {
      device.dispose();
      vi.restoreAllMocks();
    });
    const now = `(resolution: ${String(globalThis.devicePixelRatio)}dppx)`;
    expect(asked()).toStrictEqual([now]);
    listeners[0]?.();
    expect(changed).toHaveBeenCalledOnce();
    // It listens again, at the ratio now: a further change is heard too.
    expect(asked()).toStrictEqual([now, now]);
  });
});
