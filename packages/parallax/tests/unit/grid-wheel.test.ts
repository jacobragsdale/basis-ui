import { describe, expect, test } from "vite-plus/test";

import { rowGeometry } from "#grid/geometry.ts";
import { wheelRows, wheelTop } from "#grid/wheel.ts";
import type { WheelBody, WheelLike } from "#grid/wheel.ts";

const still: WheelLike = { ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 0, shiftKey: false };
const page = 20;

/** A wheel event in pixels, as Chromium gives one: a notch is 100 pixels and a legacy delta of 120 against it. */
function pixels(deltaY: number, wheelDeltaY: number, more: Partial<WheelLike> = {}): WheelLike {
  return { ...still, deltaY, wheelDeltaY, ...more };
}

describe("wheelRows", () => {
  test("moves three rows for a notch of a mouse's wheel, the platform's lines, and more for more", () => {
    expect(wheelRows(pixels(100, -120), page)).toBe(3);
    expect(wheelRows(pixels(-100, 120), page)).toBe(-3);
    // Two notches at once, as a fast wheel sends, and a desktop set to six lines a notch.
    expect(wheelRows(pixels(200, -240), page)).toBe(6);
    expect(wheelRows(pixels(200, -120), page)).toBe(6);
  });

  test("moves a row a line, and a page of rows a page, whatever the legacy delta says", () => {
    expect(wheelRows({ ...still, deltaMode: 1, deltaY: 3 }, page)).toBe(3);
    expect(wheelRows({ ...still, deltaMode: 1, deltaY: -1 }, page)).toBe(-1);
    expect(wheelRows({ ...still, deltaMode: 2, deltaY: 1 }, page)).toBe(page);
  });

  test("leaves a trackpad's pixels to the browser, which scrolls them smoothly", () => {
    // Small deltas, whose legacy delta is no whole notch.
    expect(wheelRows(pixels(4, -12), page)).toBeNull();
    expect(wheelRows(pixels(37.5, -45), page)).toBeNull();
    // A browser that gives no legacy delta.
    expect(wheelRows({ ...still, deltaY: 100 }, page)).toBeNull();
  });

  test("leaves the horizontal wheel, Shift's sideways scroll and Ctrl's zoom to the browser", () => {
    expect(wheelRows(pixels(0, 0, { deltaX: 100 }), page)).toBeNull();
    expect(wheelRows(pixels(100, -120, { deltaX: 120 }), page)).toBeNull();
    expect(wheelRows(pixels(100, -120, { shiftKey: true }), page)).toBeNull();
    expect(wheelRows(pixels(100, -120, { ctrlKey: true }), page)).toBeNull();
    expect(wheelRows(still, page)).toBeNull();
  });
});

describe("wheelTop", () => {
  const sizes = { headerPx: 30, rowPx: 24 };
  /** A body 510 pixels tall, 20 rows under the header, over `totalRows` rows, scrolled to `scrollTop`. */
  function body(scrollTop: number, totalRows = 1000): WheelBody {
    const clientHeight = 510;
    const rows = rowGeometry(totalRows, sizes, clientHeight);
    return {
      metrics: sizes,
      rows,
      scroll: { clientHeight, scrollHeight: rows.spacerPx, scrollTop },
      totalRows,
    };
  }
  const down = pixels(100, -120);
  const up = pixels(-100, 120);

  test("lands on a whole row, from part of one too", () => {
    expect(wheelTop(down, body(0))).toBe(72);
    expect(wheelTop(down, body(34))).toBe(96);
    expect(wheelTop(up, body(96))).toBe(24);
  });

  test("leaves a wheel that cannot move the rows to the browser, which scrolls the page", () => {
    expect(wheelTop(up, body(0))).toBeNull();
    const end = body(0).rows.spacerPx - 510;
    expect(wheelTop(down, body(end))).toBeNull();
    // Short of the end, a notch goes as far as it can.
    expect(wheelTop(down, body(end - 30))).toBe(end);
    expect(wheelTop(pixels(4, -12), body(0))).toBeNull();
  });

  test("lands on a row in a table taller than the scroll can be", () => {
    const tall = body(0, 1_000_000);
    const top = wheelTop(down, tall);
    expect(tall.rows.firstRow(top ?? 0, 510)).toBe(3);
  });
});
