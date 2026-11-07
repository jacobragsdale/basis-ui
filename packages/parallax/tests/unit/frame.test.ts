import { Decimal, Field, Float64, Int32, Int64, Uint8, Utf8, makeData } from "apache-arrow";
import { describe, expect, test } from "vite-plus/test";

import { decodeFrame } from "#frame/frame.ts";
import { FrameError } from "#frame/readers.ts";

import { bits, column, decimals, floats, frameMessage, frameOf, ints, text } from "./arrow.ts";
import type { Column } from "./arrow.ts";

const decimalType = new Decimal(2, 38, 128);

const pivot: readonly Column[] = [
  column(
    { name: "__depth", role: "depth", type: new Int32() },
    makeData({ data: new Int32Array([0, 1]), length: 2, type: new Int32() }),
  ),
  column({ name: "__kind", role: "kind", type: new Utf8() }, text(["total", "leaf"])),
  column({ name: "__expanded", role: "expanded", type: new Utf8() }, text(["", ""])),
  column({ name: "__label", role: "label", type: new Utf8() }, text(["Total", "Rates"])),
  column({ name: "desk", role: "group", type: new Utf8() }, text(["", "Rates"]), {
    "parallax.level": "0",
  }),
  // The second data column comes first in the batch: order is by index, not position.
  column({ name: "sum(pnl)", role: "value", type: new Float64() }, floats([0.1, 1e-7]), {
    "parallax.index": "1",
    "parallax.title": "sum(pnl)",
  }),
  column({ name: "sum(pnl)#text", role: "text", type: new Utf8() }, text(["0.10", "0.00"]), {
    "parallax.index": "1",
  }),
  column(
    { name: "sum(mv)", role: "value", type: decimalType },
    decimals([123_456_789_012_345_678_901n, -5n]),
    { "parallax.index": "0", "parallax.split": '["Bond"]', "parallax.title": "Bond | sum(mv)" },
  ),
  column(
    { name: "sum(mv)#flag", role: "flag", type: new Uint8() },
    makeData({ data: new Uint8Array([0, 2]), length: 2, type: new Uint8() }),
    { "parallax.index": "0" },
  ),
  column(
    { name: "sum(mv)#text", role: "text", type: new Utf8() },
    text(["1,234,567,890,123,456,789.01", "mixed"]),
    { "parallax.index": "0" },
  ),
];

function decode(columns: readonly Column[], rows: number): ReturnType<typeof decodeFrame> {
  return decodeFrame(frameMessage(columns, rows));
}

/** The pivot with one field replaced. */
function replacing(name: string, replacement: Column): readonly Column[] {
  return pivot.map((entry) => (entry.field.name === name ? replacement : entry));
}

/** A field with more metadata. */
function withMetadata(entry: Column, key: string, value: string): Column {
  const metadata = new Map([...entry.field.metadata, [key, value]]);
  return { data: entry.data, field: new Field(entry.field.name, entry.field.type, true, metadata) };
}

describe(decodeFrame, () => {
  test("matches data columns to their text and flags by index", () => {
    const frame = decode(pivot, 2);
    expect(frame.columns.map((entry) => entry.title)).toStrictEqual(["Bond | sum(mv)", "sum(pnl)"]);
    expect(frame.columns.map((entry) => entry.split)).toStrictEqual([["Bond"], null]);
    const [mv, pnl] = frame.columns;
    expect(mv?.text(0)).toBe("1,234,567,890,123,456,789.01");
    expect(mv?.flag(1)).toBe("mixed");
    expect(pnl?.text(1)).toBe("0.00");
  });

  test("reads the group keys and the tree", () => {
    const frame = decode(pivot, 2);
    expect(frame.groups.map((group) => group.name)).toStrictEqual(["desk"]);
    expect(frame.tree?.label(1)).toBe("Rates");
    expect(frame.tree?.kind(0)).toBe("total");
  });

  test("copies every digit, and flagged cells as their marker", () => {
    const [mv, pnl] = decode(pivot, 2).columns;
    expect(mv?.copy(0)).toBe("1234567890123456789.01");
    expect(mv?.copy(1)).toBe("mixed");
    expect(pnl?.copy(1)).toBe("1e-7");
  });

  test("refuses a value without display text", () => {
    const missing = pivot.filter((entry) => entry.field.name !== "sum(pnl)#text");
    expect(() => decode(missing, 2)).toThrow(FrameError);
  });

  test("refuses display text with a row missing", () => {
    const bytes = new TextEncoder().encode("0.10");
    // The second row is null: its validity bit is clear.
    const holed = makeData({
      data: bytes,
      length: 2,
      nullBitmap: new Uint8Array([1]),
      nullCount: 1,
      type: new Utf8(),
      valueOffsets: new Int32Array([0, bytes.length, bytes.length]),
    });
    const textField = { name: "sum(pnl)#text", role: "text", type: new Utf8() };
    const missing = replacing("sum(pnl)#text", column(textField, holed, { "parallax.index": "1" }));
    expect(() => decode(missing, 2)).toThrow(/display text is missing/u);
  });

  test("refuses unknown roles and flags", () => {
    const unknownRole = [
      ...pivot,
      column({ name: "extra", role: "sparkle", type: new Utf8() }, text(["a", "b"])),
    ];
    expect(() => decode(unknownRole, 2)).toThrow(/unknown role/u);
    const flagField = { name: "sum(mv)#flag", role: "flag", type: new Uint8() };
    const badFlags = makeData({ data: new Uint8Array([0, 9]), length: 2, type: new Uint8() });
    const badFlag = replacing(
      "sum(mv)#flag",
      column(flagField, badFlags, { "parallax.index": "0" }),
    );
    expect(() => decode(badFlag, 2)).toThrow(/unknown cell flag/u);
  });

  test("refuses pivot values that are not a list of plain values", () => {
    const mv = pivot.find((entry) => entry.field.name === "sum(mv)");
    if (mv === undefined) {
      throw new Error("the pivot has a sum(mv) column");
    }
    const bad = replacing("sum(mv)", withMetadata(mv, "parallax.split", '[{"a":1}]'));
    expect(() => decode(bad, 2)).toThrow(/plain values/u);
  });

  test("refuses gaps in data column numbering", () => {
    const gap = pivot.map((entry) =>
      entry.field.metadata.get("parallax.index") === "1"
        ? withMetadata(entry, "parallax.index", "2")
        : entry,
    );
    expect(() => decode(gap, 2)).toThrow(/numbered from 0/u);
  });
});

describe("decodeFrame, for a detail view", () => {
  // A group of two rows: its count, and a total in the column beside the rows' values.
  const detail: readonly Column[] = [
    column(
      { name: "__depth", role: "depth", type: new Int32() },
      makeData({ data: new Int32Array([1, 2, 2]), length: 3, type: new Int32() }),
    ),
    column({ name: "__kind", role: "kind", type: new Utf8() }, text(["group", "row", "row"])),
    column({ name: "__expanded", role: "expanded", type: new Utf8() }, text(["", "", ""])),
    column({ name: "__label", role: "label", type: new Utf8() }, text(["Rates", "", ""])),
    column({ name: "__rows", role: "rows", type: new Int64() }, ints([2n, null, null])),
    column(
      { name: "pnl", role: "value", type: new Float64() },
      makeData({
        data: new Float64Array([0, 1.5, 2.25]),
        length: 3,
        nullBitmap: bits([false, true, true]),
        nullCount: 1,
        type: new Float64(),
      }),
      { "parallax.index": "0", "parallax.title": "P&L" },
    ),
    column(
      { name: "pnl#total", role: "total", type: decimalType },
      makeData({
        data: decimals([375n, 0n, 0n]).values,
        length: 3,
        nullBitmap: bits([true, false, false]),
        nullCount: 2,
        type: decimalType,
      }),
      { "parallax.index": "0" },
    ),
    column({ name: "pnl#text", role: "text", type: new Utf8() }, text(["3.75", "1.50", "2.25"]), {
      "parallax.index": "0",
    }),
  ];
  const totalsRow: readonly Column[] = [
    column({ name: "pnl", role: "value", type: new Float64() }, floats([3.75]), {
      "parallax.index": "0",
    }),
    column({ name: "pnl#text", role: "text", type: new Utf8() }, text(["3.75"]), {
      "parallax.index": "0",
    }),
  ];

  test("reads row kinds and group counts", () => {
    const frame = decodeFrame(frameMessage(detail, 3, frameOf(totalsRow, 1)));
    expect([0, 1, 2].map((row) => frame.tree?.kind(row))).toStrictEqual(["group", "row", "row"]);
    expect([0, 1, 2].map((row) => frame.tree?.rows(row))).toStrictEqual([2, null, null]);
    expect(frame.totals?.[0]?.text(0)).toBe("3.75");
  });

  test("reads each group's typed total, which a group row copies with every digit", () => {
    const [pnl] = decodeFrame(frameMessage(detail, 3, frameOf(totalsRow, 1))).columns;
    expect(pnl?.numeric).toBe(true);
    expect(pnl?.totalNumeric).toBe(true);
    expect(pnl?.copy(0)).toBe("3.75");
    expect(pnl?.copy(1)).toBe("1.5");
    expect(pnl?.total?.(1)).toStrictEqual({ kind: "null" });
  });

  test("keeps a group key apart from the shown column of the same name", () => {
    // Grouped by desk, with desk also shown: two fields named desk, one key and one value.
    const shown: readonly Column[] = [
      ...detail.slice(0, 5),
      column({ name: "desk", role: "group", type: new Utf8() }, text(["Rates", "Rates", "Rates"]), {
        "parallax.level": "0",
      }),
      column({ name: "desk", role: "value", type: new Utf8() }, text(["", "Rates", "Rates"]), {
        "parallax.index": "0",
      }),
      column({ name: "desk#text", role: "text", type: new Utf8() }, text(["", "Rates", "Rates"]), {
        "parallax.index": "0",
      }),
    ];
    const frame = decode(shown, 3);
    expect(frame.groups.map((group) => [group.name, group.value(0)])).toStrictEqual([
      ["desk", { kind: "text", value: "Rates" }],
    ]);
    expect(frame.columns.map((entry) => entry.name)).toStrictEqual(["desk"]);
    expect(frame.columns[0]?.text(1)).toBe("Rates");
  });

  test("refuses a totals row that does not match the frame's columns", () => {
    const wide = [
      ...totalsRow,
      column({ name: "x", role: "value", type: new Float64() }, floats([1]), {
        "parallax.index": "1",
      }),
      column({ name: "x#text", role: "text", type: new Utf8() }, text(["1"]), {
        "parallax.index": "1",
      }),
    ];
    expect(() => decodeFrame(frameMessage(detail, 3, frameOf(wide, 1)))).toThrow(FrameError);
  });
});
