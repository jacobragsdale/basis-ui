import { describe, expect, test } from "vite-plus/test";

import {
  columnAt,
  defaultTreeWidth,
  defaultWidth,
  flatGeometry,
  groupedGeometry,
  rowGeometry,
  screenX,
  scrolledColumns,
} from "#grid/geometry.ts";

describe("flatGeometry", () => {
  const geometry = flatGeometry(
    4,
    { desk: 60, price: 300 },
    { names: ["fund", "desk", "book", "price"] },
  );

  test("places columns by their own widths", () => {
    expect([0, 1, 2, 3].map((column) => geometry.x(column))).toStrictEqual([
      0,
      defaultWidth,
      defaultWidth + 60,
      2 * defaultWidth + 60,
    ]);
    expect(geometry.contentWidth).toBe(2 * defaultWidth + 60 + 300);
    expect(geometry.width(3)).toBe(300);
  });

  test("finds the column under any offset", () => {
    expect(geometry.indexAt(0)).toBe(0);
    expect(geometry.indexAt(defaultWidth - 1)).toBe(0);
    expect(geometry.indexAt(defaultWidth)).toBe(1);
    expect(geometry.indexAt(defaultWidth + 59)).toBe(1);
    expect(geometry.indexAt(geometry.contentWidth + 1000)).toBe(3);
  });

  test("gives unnamed columns the default width", () => {
    const partial = flatGeometry(3, {}, { names: ["fund"] });
    expect(partial.contentWidth).toBe(3 * defaultWidth);
    expect(partial.widthKey(0)).toBe("fund");
  });

  test("keeps the pinned columns' width as the frozen edge", () => {
    const pinned = flatGeometry(
      4,
      { fund: 80 },
      { names: ["fund", "desk", "book", "price"], pinned: 2 },
    );
    expect(pinned.pinned).toBe(2);
    expect(pinned.frozenPx).toBe(80 + defaultWidth);
    expect(flatGeometry(1, {}, { names: ["fund"], pinned: 3 }).pinned).toBe(1);
  });

  test("fits columns without a saved width, and starts after a group column", () => {
    const fitted = flatGeometry(
      3,
      { fund: 50 },
      { fitted: { desk: 90, fund: 300 }, names: ["fund", "desk", "book"], treePx: 200 },
    );
    expect([0, 1, 2].map((column) => fitted.x(column))).toStrictEqual([200, 250, 340]);
    expect(fitted.frozenPx).toBe(200);
    expect(fitted.indexAt(0)).toBe(0);
    expect(fitted.indexAt(260)).toBe(1);
    expect(fitted.contentWidth).toBe(340 + defaultWidth);
  });
});

describe("groupedGeometry", () => {
  // Three measures repeated for 1,000 pivot values and the row total.
  const geometry = groupedGeometry(3003, 3, { "__measure:0": 100, "__measure:2": 50, __tree: 200 });
  const span = 100 + defaultWidth + 50;

  test("repeats measure widths after the pinned group column", () => {
    expect(geometry.treePx).toBe(200);
    expect(geometry.x(3)).toBe(200 + span);
    expect(geometry.x(5)).toBe(200 + span + 100 + defaultWidth);
    expect(geometry.width(3002)).toBe(50);
    expect(geometry.contentWidth).toBe(200 + 1001 * span);
  });

  test("finds a column far to the right without walking the others", () => {
    expect(geometry.indexAt(geometry.x(2003))).toBe(2003);
    expect(geometry.indexAt(geometry.x(2003) + geometry.width(2003) - 1)).toBe(2003);
    expect(geometry.indexAt(1e12)).toBe(3002);
    expect(geometry.widthKey(2003)).toBe("__measure:2");
    expect(groupedGeometry(1, 1, {}).treePx).toBe(defaultTreeWidth);
  });
});

describe("rowGeometry", () => {
  test("maps rows to offsets and back under a header that never scrolls", () => {
    const rows = rowGeometry(1000, { headerPx: 30, rowPx: 24 });
    expect(rows.spacerPx).toBe(1000 * 24 + 30);
    expect(rows.firstRow(240, 600)).toBe(10);
    expect(rows.scrollTopFor(10, 600)).toBe(240);
  });

  test("scales when there are too many rows to scroll natively", () => {
    const rows = rowGeometry(20_000_000, { headerPx: 30, rowPx: 24 });
    expect(rows.spacerPx).toBeLessThan(20_000_000 * 24);
    expect(
      [0, 1, 12_345, 10_000_000, 19_999_970].map((row) =>
        rows.firstRow(rows.scrollTopFor(row, 600), 600),
      ),
    ).toStrictEqual([0, 1, 12_345, 10_000_000, 19_999_970]);
  });

  test.each([
    { ratio: 1, rowPx: 24 },
    { ratio: 1.25, rowPx: 24 },
    { ratio: 1.5, rowPx: 20 },
    { ratio: 1.75, rowPx: 24 },
  ])(
    "lands on every row of 1,000,000 past the native scroll's reach, at ratio $ratio, as a browser rounds the offset",
    ({ ratio, rowPx }) => {
      const viewport = 600;
      const rows = rowGeometry(1_000_000, { headerPx: 30, rowPx }, viewport);
      expect(rows.spacerPx).toBeLessThan(1_000_000 * rowPx);
      /* A browser keeps a scroll offset in whole device pixels. One height on both sides: that the painter and hit
       * testing take the same one is held by tests/browser/scaled-rows.test.tsx, at the ratios themselves. */
      const landed = (row: number): number =>
        rows.firstRow(Math.round(rows.scrollTopFor(row, viewport) * ratio) / ratio, viewport);
      const sample = Array.from({ length: 2000 }, (_unused, index) => index * 487 + (index % 7));
      expect(sample.filter((row) => landed(row) !== row)).toStrictEqual([]);
    },
  );

  test("shows the last row whole at the scroll's end when the body holds part of a row more", () => {
    // Ten and a half rows of 24 px under a 30 px header.
    const viewport = 30 + 10.5 * 24;
    for (const count of [1000, 20_000_000]) {
      const rows = rowGeometry(count, { headerPx: 30, rowPx: 24 }, viewport);
      const first = rows.firstRow(rows.spacerPx - viewport, viewport);
      // The rows draw from the first under the header, one every 24 px: the last ends inside the body.
      expect(30 + (count - first) * 24).toBeLessThanOrEqual(viewport);
      expect(count - first).toBe(10);
    }
  });
});

describe("pinned columns on screen", () => {
  // Two pinned columns of 100, then eight of 140.
  const geometry = flatGeometry(
    10,
    { c0: 100, c1: 100 },
    { names: Array.from({ length: 10 }, (_name, index) => `c${String(index)}`), pinned: 2 },
  );

  test("keep their place while the rest scroll under them", () => {
    expect(screenX(geometry, 1, 500)).toBe(100);
    expect(screenX(geometry, 6, 500)).toBe(200 + 4 * 140 - 500);
    expect(columnAt(geometry, 150, 500)).toBe(1);
    expect(columnAt(geometry, 210, 500)).toBe(5);
    expect(columnAt(geometry, 5000, 0)).toBeNull();
  });

  test("list only the scrolling columns in view", () => {
    expect(scrolledColumns(geometry, 0, 600)).toStrictEqual([2, 3, 4]);
    expect(scrolledColumns(geometry, 280, 600)).toStrictEqual([4, 5, 6]);
    expect(
      scrolledColumns(flatGeometry(2, {}, { names: ["fund", "desk"], pinned: 2 }), 0, 600),
    ).toStrictEqual([]);
  });
});
