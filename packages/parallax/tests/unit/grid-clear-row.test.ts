/* A row cleared because the frame no longer holds it, as when the grid scrolls back before a late frame lands: its
 * cells' drawn text is forgotten, so the frame's arrival draws them again rather than leaving them blank. */

import { describe, expect, test } from "vite-plus/test";

import { Tally } from "#grid/paint/damage.ts";
import { metricsOf } from "#grid/paint/metrics.ts";
import { clearRow } from "#grid/paint/rows.ts";
import { chartColors } from "#theme/charts.ts";
import { defaultTheme } from "#theme/read.ts";

/** Whether `value` takes a painter's calls as a context does: the recorder answers every one. */
function paintsLikeContext(value: unknown): value is CanvasRenderingContext2D {
  return value instanceof Object;
}

/** A context that takes every call and property, and draws nothing. */
function sink(): CanvasRenderingContext2D {
  const context: unknown = new Proxy({}, { get: () => (): void => undefined, set: () => true });
  if (!paintsLikeContext(context)) {
    throw new TypeError("The sink is no context.");
  }
  return context;
}

describe(clearRow, () => {
  test("forgets the text a cleared row's cells were drawn with, and only that row's", () => {
    const theme = { ...defaultTheme("light"), colors: chartColors.light };
    const drawn = new Map([
      ["5:0", "100.50"],
      ["5:1", "Atlas"],
      ["6:0", "200.25"],
      ["15:0", "1.75"],
    ]);
    const pass = {
      bodyBottom: 300,
      context: sink(),
      drawn,
      drawnRows: new Set([5, 6, 15]),
      metrics: metricsOf(theme),
      ratio: 1,
      tally: new Tally({ cells: true, exposed: null, ratio: 1 }),
      theme,
      width: 400,
    };
    clearRow(pass, { row: 5, y: 150 });
    expect([[...drawn.keys()], [...pass.drawnRows]]).toStrictEqual([
      ["6:0", "15:0"],
      [6, 15],
    ]);
  });
});
