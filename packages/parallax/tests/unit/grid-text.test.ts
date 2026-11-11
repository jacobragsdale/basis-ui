import { describe, expect, test } from "vite-plus/test";

import { TextWidths, clipText } from "#grid/paint/text.ts";
import type { Pen } from "#grid/paint/text.ts";

/** Whether `value` takes the calls text drawing makes, as a context does: the fake below answers each one. */
function drawsLikeContext(value: unknown): value is CanvasRenderingContext2D {
  return value instanceof Object && "measureText" in value && "fillText" in value;
}

/** A pen whose characters are each 7 pixels wide, which counts the texts it measures and keeps those it draws. */
function sevenWide(): { pen: Pen; measured: string[]; drawn: string[] } {
  const measured: string[] = [];
  const drawn: string[] = [];
  const fake: unknown = {
    fillStyle: "",
    font: "",
    fillRect: (): void => undefined,
    fillText: (text: string): void => {
      drawn.push(text);
    },
    measureText: (text: string): { width: number } => {
      measured.push(text);
      return { width: 7 * text.length };
    },
  };
  if (!drawsLikeContext(fake)) {
    throw new TypeError("The fake is no context.");
  }
  const context = fake;
  return {
    drawn,
    measured,
    pen: { context, padding: 8, ratio: 1, rowPx: 24, widths: new TextWidths() },
  };
}

describe(clipText, () => {
  test("cuts a long text with a search by halves: a few measurements, not one for each character dropped", () => {
    const { drawn, measured, pen } = sevenWide();
    const text = "x".repeat(400);
    // 100 pixels of room inside the padding: 13 characters and an ellipsis are 98 pixels, 14 are 105.
    const cut = clipText(pen, { numeric: false, text, width: 116, x: 0, y: 12 });
    expect(cut).toBe(true);
    expect(drawn).toStrictEqual([`${"x".repeat(13)}…`]);
    expect(measured.length).toBeLessThanOrEqual(12);
  });

  test("keeps a text that fits whole, and cuts a text of one character too many", () => {
    const { drawn, pen } = sevenWide();
    clipText(pen, { numeric: false, text: "abcd", width: 44, x: 0, y: 12 });
    clipText(pen, { numeric: false, text: "abcde", width: 44, x: 0, y: 12 });
    clipText(pen, { numeric: false, text: "abcdef", width: 4, x: 0, y: 12 });
    expect(drawn).toStrictEqual(["abcd", "abc…", "…"]);
  });
});
