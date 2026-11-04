import { create } from "@bufbuild/protobuf";
import { Decimal, Field, Float64, Int32, Int64, makeData, RecordBatch, Schema, Struct, Table, tableToIPC, Uint8, Utf8 } from "apache-arrow";
import type { Data, DataType } from "apache-arrow";
import { describe, expect, it } from "vitest";

import { CellFlag, decodeFrame, FrameError } from "./frame";
import { FrameSchema } from "./proto/parallax_pb";

interface Column {
  readonly field: Field;
  readonly data: Data;
}

function column(name: string, type: DataType, role: string, data: Data, extra: Record<string, string> = {}): Column {
  return { field: new Field(name, type, true, new Map(Object.entries({ "parallax.role": role, ...extra }))), data };
}

function text(values: readonly string[]): Data<Utf8> {
  const encoder = new TextEncoder();
  const bytes = values.map((v) => encoder.encode(v));
  const offsets = new Int32Array(values.length + 1);
  bytes.forEach((b, i) => {
    offsets[i + 1] = (offsets[i] ?? 0) + b.length;
  });
  const data = new Uint8Array(offsets[values.length] ?? 0);
  bytes.forEach((b, i) => {
    data.set(b, offsets[i] ?? 0);
  });
  return makeData({ type: new Utf8(), length: values.length, valueOffsets: offsets, data });
}

function frameOf(columns: readonly Column[], rows: number): Uint8Array {
  const schema = new Schema(columns.map((c) => c.field));
  const struct = makeData({ type: new Struct(schema.fields), length: rows, nullCount: 0, children: columns.map((c) => c.data) });
  return tableToIPC(new Table([new RecordBatch(schema, struct)]), "stream");
}

function decode(columns: readonly Column[], rows: number): ReturnType<typeof decodeFrame> {
  return decodeFrame(create(FrameSchema, { viewId: 1, batch: frameOf(columns, rows), totalRows: BigInt(rows), totalColumns: 2 }));
}

/** Two decimal words per row, little-endian, for a 128-bit decimal. */
function decimals(values: readonly bigint[]): Data<Decimal> {
  const words = new Uint32Array(values.length * 4);
  values.forEach((v, row) => {
    let u = BigInt.asUintN(128, v);
    for (let i = 0; i < 4; i += 1) {
      words[row * 4 + i] = Number(u & 0xffff_ffffn);
      u >>= 32n;
    }
  });
  return makeData({ type: new Decimal(2, 38, 128), length: values.length, data: words });
}

const pivot: readonly Column[] = [
  column("__depth", new Int32(), "depth", makeData({ type: new Int32(), length: 2, data: new Int32Array([0, 1]) })),
  column("__kind", new Utf8(), "kind", text(["total", "leaf"])),
  column("__expanded", new Utf8(), "expanded", text(["", ""])),
  column("__label", new Utf8(), "label", text(["Total", "Rates"])),
  column("desk", new Utf8(), "group", text(["", "Rates"]), { "parallax.level": "0" }),
  // The second data column comes first in the batch: order is by index, not position.
  column("sum(pnl)", new Float64(), "value", makeData({ type: new Float64(), length: 2, data: new Float64Array([0.1, 1e-7]) }), { "parallax.index": "1", "parallax.title": "sum(pnl)" }),
  column("sum(pnl)#text", new Utf8(), "text", text(["0.10", "0.00"]), { "parallax.index": "1" }),
  column("sum(mv)", new Decimal(2, 38, 128), "value", decimals([123_456_789_012_345_678_901n, -5n]), { "parallax.index": "0", "parallax.title": "Bond | sum(mv)", "parallax.split": '["Bond"]' }),
  column("sum(mv)#flag", new Uint8(), "flag", makeData({ type: new Uint8(), length: 2, data: new Uint8Array([0, 2]) }), { "parallax.index": "0" }),
  column("sum(mv)#text", new Utf8(), "text", text(["1,234,567,890,123,456,789.01", "mixed"]), { "parallax.index": "0" })
];

describe("decodeFrame", () => {
  it("matches data columns to their text and flags by index", () => {
    const frame = decode(pivot, 2);
    expect(frame.columns.map((c) => c.title)).toEqual(["Bond | sum(mv)", "sum(pnl)"]);
    expect(frame.columns.map((c) => c.split)).toEqual([["Bond"], null]);
    const [mv, pnl] = frame.columns;
    expect(mv?.text(0)).toBe("1,234,567,890,123,456,789.01");
    expect(mv?.flag(1)).toBe(CellFlag.Mixed);
    expect(pnl?.text(1)).toBe("0.00");
    expect(frame.groups.map((g) => g.name)).toEqual(["desk"]);
    expect(frame.tree?.label(1)).toBe("Rates");
  });

  it("copies every digit, and flagged cells as their marker", () => {
    const [mv, pnl] = decode(pivot, 2).columns;
    expect(mv?.copy(0)).toBe("1234567890123456789.01");
    expect(mv?.copy(1)).toBe("mixed");
    expect(pnl?.copy(1)).toBe("1e-7");
  });

  it("refuses a value without display text", () => {
    const missing = pivot.filter((c) => c.field.name !== "sum(pnl)#text");
    expect(() => decode(missing, 2)).toThrow(FrameError);
  });

  it("refuses display text with a row missing", () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode("0.10");
    // The second row is null: its validity bit is clear.
    const holed = makeData({ type: new Utf8(), length: 2, nullCount: 1, nullBitmap: new Uint8Array([0b01]), valueOffsets: new Int32Array([0, bytes.length, bytes.length]), data: bytes });
    const missing = pivot.map((c) => (c.field.name === "sum(pnl)#text" ? column("sum(pnl)#text", new Utf8(), "text", holed, { "parallax.index": "1" }) : c));
    expect(() => decode(missing, 2)).toThrow(/display text is missing/);
  });

  it("refuses unknown roles and flags", () => {
    const unknownRole = [...pivot, column("extra", new Utf8(), "sparkle", text(["a", "b"]))];
    expect(() => decode(unknownRole, 2)).toThrow(/unknown role/);
    const badFlag = pivot.map((c) =>
      c.field.name === "sum(mv)#flag" ? column("sum(mv)#flag", new Uint8(), "flag", makeData({ type: new Uint8(), length: 2, data: new Uint8Array([0, 9]) }), { "parallax.index": "0" }) : c
    );
    expect(() => decode(badFlag, 2)).toThrow(/unknown cell flag/);
  });

  it("refuses pivot values that are not a list of plain values", () => {
    const bad = pivot.map((c) =>
      c.field.name === "sum(mv)" ? { field: new Field(c.field.name, c.field.type, true, new Map([...c.field.metadata, ["parallax.split", '[{"a":1}]']])), data: c.data } : c
    );
    expect(() => decode(bad, 2)).toThrow(/plain values/);
  });

  it("refuses gaps in data column numbering", () => {
    const gap = pivot.map((c) => (c.field.metadata.get("parallax.index") === "1" ? new Field(c.field.name, c.field.type, true, new Map([...c.field.metadata, ["parallax.index", "2"]])) : c.field));
    expect(() =>
      decode(
        gap.map((field, i) => ({ field, data: pivot[i]?.data ?? text([]) })),
        2
      )
    ).toThrow(/numbered from 0/);
  });
});

describe("decodeFrame, for a detail view", () => {
  const ints = (values: readonly (bigint | null)[]): Data =>
    makeData({
      type: new Int64(),
      length: values.length,
      nullCount: values.filter((v) => v === null).length,
      nullBitmap: bits(values.map((v) => v !== null)),
      data: BigInt64Array.from(values.map((v) => v ?? 0n))
    });

  function bits(valid: readonly boolean[]): Uint8Array {
    const out = new Uint8Array(Math.ceil(valid.length / 8));
    valid.forEach((v, i) => {
      if (v) {
        out[i >> 3] = (out[i >> 3] ?? 0) | (1 << (i & 7));
      }
    });
    return out;
  }

  // A group of two rows: its count, and a total in the column beside the rows' values.
  const detail: readonly Column[] = [
    column("__depth", new Int32(), "depth", makeData({ type: new Int32(), length: 3, data: new Int32Array([1, 2, 2]) })),
    column("__kind", new Utf8(), "kind", text(["group", "row", "row"])),
    column("__expanded", new Utf8(), "expanded", text(["", "", ""])),
    column("__label", new Utf8(), "label", text(["Rates", "", ""])),
    column("__rows", new Int64(), "rows", ints([2n, null, null])),
    column("pnl", new Float64(), "value", makeData({ type: new Float64(), length: 3, nullCount: 1, nullBitmap: bits([false, true, true]), data: new Float64Array([0, 1.5, 2.25]) }), {
      "parallax.index": "0",
      "parallax.title": "P&L"
    }),
    column(
      "pnl#total",
      new Decimal(2, 38, 128),
      "total",
      makeData({ type: new Decimal(2, 38, 128), length: 3, nullCount: 2, nullBitmap: bits([true, false, false]), data: decimals([375n, 0n, 0n]).values }),
      { "parallax.index": "0" }
    ),
    column("pnl#text", new Utf8(), "text", text(["3.75", "1.50", "2.25"]), { "parallax.index": "0" })
  ];

  it("reads row kinds, group counts and each group's typed total", () => {
    const totalsRow: readonly Column[] = [
      column("pnl", new Float64(), "value", makeData({ type: new Float64(), length: 1, data: new Float64Array([3.75]) }), { "parallax.index": "0" }),
      column("pnl#text", new Utf8(), "text", text(["3.75"]), { "parallax.index": "0" })
    ];
    const frame = decodeFrame(create(FrameSchema, { viewId: 1, batch: frameOf(detail, 3), totals: frameOf(totalsRow, 1), totalRows: 3n, totalColumns: 1 }));
    expect([0, 1, 2].map((r) => frame.tree?.kind(r))).toEqual(["group", "row", "row"]);
    expect([0, 1, 2].map((r) => frame.tree?.rows(r))).toEqual([2, null, null]);
    const [pnl] = frame.columns;
    expect(pnl?.numeric).toBe(true);
    // The group row's cell copies its total's every digit; a row copies its own value.
    expect(pnl?.copy(0)).toBe("3.75");
    expect(pnl?.copy(1)).toBe("1.5");
    expect(pnl?.total?.(1)).toEqual({ kind: "null" });
    expect(frame.totals?.[0]?.text(0)).toBe("3.75");
  });

  it("refuses a totals row that does not match the frame's columns", () => {
    const wide = [...detail.slice(5), column("x", new Float64(), "value", makeData({ type: new Float64(), length: 1, data: new Float64Array([1]) }), { "parallax.index": "1" })];
    expect(() => decodeFrame(create(FrameSchema, { viewId: 1, batch: frameOf(detail, 3), totals: frameOf(wide.slice(0, 1), 1), totalRows: 3n, totalColumns: 1 }))).toThrow(FrameError);
  });
});
