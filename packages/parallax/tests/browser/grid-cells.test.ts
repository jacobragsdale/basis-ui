/* Rich cells: a data bar over the domain the engine gives, in the gain and loss tints of a signed column; a badge in its
 * value's tint; and a rule's fill, each read from the canvas's pixels against the theme's colours. The columns are as
 * wide as the layout sets them, and rows and the header as tall as the theme's tokens. */

import "@basis/ui/styles.css";

import { describe, expect, test } from "vite-plus/test";

import type { LayoutInput } from "#layout/layout.ts";
import { readTheme } from "#theme/read.ts";

import { canvasOf, drawn, renderGrid } from "./grid-helpers.tsx";

const [deskPx, fundPx, valuePx] = [120, 120, 160];

const layout = {
  cells: {
    desk: { kind: "badge", values: { Credit: "warning", Rates: "positive" } },
    market_value: { kind: "bar" },
  },
  column_widths: { desk: deskPx, fund: fundPx, market_value: valuePx },
  rules: { fund: [{ format: { fill: true, tone: "info" }, when: { op: "eq", value: "Boreal" } }] },
} satisfies LayoutInput;

/** A length in CSS pixels, such as `24px`. */
function pixels(length: string): number {
  return Number(length.replace(/px$/u, ""));
}

/** A CSS colour as the canvas draws it, `r,g,b`. */
function rgbOf(color: string): string {
  const canvas = document.createElement("canvas");
  const context =
    canvas.getContext("2d", { willReadFrequently: true }) ?? expect.unreachable("no context");
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  return context.getImageData(0, 0, 1, 1).data.slice(0, 3).join(",");
}

/** The canvas's colour at CSS pixel `x` across, in the middle of row `row`, `r,g,b`. */
function pixelAt(canvas: HTMLCanvasElement, x: number, row: number): string {
  const ratio = canvas.width / canvas.clientWidth;
  const theme = readTheme(canvas);
  const [headerPx, rowPx] = [pixels(theme.headerHeight), pixels(theme.rowHeight)];
  const y = headerPx + row * rowPx + rowPx / 2;
  const context = canvas.getContext("2d") ?? expect.unreachable("no context");
  return context
    .getImageData(Math.round(x * ratio), Math.round(y * ratio), 1, 1)
    .data.slice(0, 3)
    .join(",");
}

/** The grid of the positions with rich cells, drawn, and its canvas and theme. */
async function richGrid(): Promise<{
  canvas: HTMLCanvasElement;
  theme: ReturnType<typeof readTheme>;
}> {
  const { grid } = await renderGrid({ layout });
  await drawn();
  const canvas = canvasOf(grid);
  return { canvas, theme: readTheme(canvas) };
}

const left = deskPx + fundPx;

describe("Grid with rich cells", () => {
  test("draws a bar from zero over the column's domain, in the gain's and the loss's tints", async () => {
    const { canvas, theme } = await richGrid();
    // 400 is the greatest of -50 to 400: its bar runs from zero across the cell; 0.25's is a sliver.
    expect(pixelAt(canvas, left + 40, 3)).toBe(rgbOf(theme.positiveSubtle));
    expect(pixelAt(canvas, left + 40, 5)).not.toBe(rgbOf(theme.positiveSubtle));
    // -50's bar runs left from zero.
    expect(pixelAt(canvas, left + 14, 2)).toBe(rgbOf(theme.negativeSubtle));
  });

  test("draws a badge in its value's tint, and a rule's fill where the value meets it", async () => {
    const { canvas, theme } = await richGrid();
    expect(pixelAt(canvas, 10, 1)).toBe(rgbOf(theme.warningSubtle));
    // Boreal's funds are filled in the note's tint, Atlas's are not.
    expect(pixelAt(canvas, left - 10, 3)).toBe(rgbOf(theme.infoSubtle));
    expect(pixelAt(canvas, left - 10, 1)).not.toBe(rgbOf(theme.infoSubtle));
  });
});
