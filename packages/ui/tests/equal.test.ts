import { describe, expect, test } from "vite-plus/test";

import { Decimal } from "#numbers/index.ts";
import { deepEqual, stableStringify } from "#utils/index.ts";

/** An object with no prototype, as `Object.create(null)` makes. */
function bare(value: object): object {
  Object.setPrototypeOf(value, null);
  return value;
}

describe("deepEqual", () => {
  test.each([
    [1, 1],
    [0, -0],
    [Number.NaN, Number.NaN],
    ["a", "a"],
    [null, null],
    [
      { coupon: 1, legs: [1, 2, { side: "x" }] },
      { legs: [1, 2, { side: "x" }], coupon: 1 },
    ],
    [[], []],
    [new Map([["k", { par: 1 }]]), new Map([["k", { par: 1 }]])],
    [new Set([{ id: 1 }, { id: 2 }]), new Set([{ id: 2 }, { id: 1 }])],
    [new Date("2026-11-07T14:00:00Z"), new Date("2026-11-07T14:00:00Z")],
    [new Date(Number.NaN), new Date(Number.NaN)],
    [Decimal.from("1.5"), Decimal.from("1.50")],
    [Temporal.PlainDate.from("2026-11-07"), Temporal.PlainDate.from("2026-11-07")],
    [
      Temporal.Instant.from("2026-11-07T14:00:00Z"),
      Temporal.Instant.from("2026-11-07T14:00:00.000Z"),
    ],
    [Temporal.Duration.from("PT1H"), Temporal.Duration.from({ hours: 1 })],
    [bare({ par: 1 }), bare({ par: 1 })],
  ])("%o equals %o", (left, right) => {
    expect(deepEqual(left, right)).toBe(true);
  });

  test.each([
    [1, "1"],
    [null, undefined],
    [{ par: 1 }, { par: 1, price: undefined }],
    [{ par: 1 }, { par: 2 }],
    [
      [1, 2],
      [2, 1],
    ],
    [[1], { 0: 1, length: 1 }],
    [new Map([["k", 1]]), new Map([["k", 2]])],
    [new Set([1, 2]), new Set([1, 3])],
    [new Set([{ id: 1 }, { id: 1 }]), new Set([{ id: 1 }, { id: 2 }])],
    [new Date(0), new Date(1)],
    [Decimal.from("1.5"), Decimal.from("1.51")],
    [Temporal.Duration.from("PT1H"), Temporal.Duration.from("PT60M")],
    [
      Temporal.ZonedDateTime.from("2026-11-07T09:00[America/New_York]"),
      Temporal.ZonedDateTime.from("2026-11-07T14:00[Europe/London]"),
    ],
    [Temporal.PlainDate.from("2026-11-07"), Temporal.PlainDateTime.from("2026-11-07T00:00")],
    [new URL("https://example.com/"), new URL("https://example.com/")],
  ])("%o does not equal %o", (left, right) => {
    expect(deepEqual(left, right)).toBe(false);
  });

  test("follows a cycle once", () => {
    const left: { name: string; self?: unknown } = { name: "a" };
    left.self = left;
    const right: { name: string; self?: unknown } = { name: "a" };
    right.self = right;
    expect(deepEqual(left, right)).toBe(true);
    const other: { name: string; self?: unknown } = { name: "b" };
    other.self = other;
    expect(deepEqual(left, other)).toBe(false);
  });
});

describe("stableStringify", () => {
  test("sorts keys at every depth, so equal values write equal text", () => {
    const left = stableStringify({ zone: 1, book: { legs: [3, { side: 1, par: 2 }], desk: null } });
    const right = stableStringify({
      book: { desk: null, legs: [3, { par: 2, side: 1 }] },
      zone: 1,
    });
    expect(left).toBe('{"book":{"desk":null,"legs":[3,{"par":2,"side":1}]},"zone":1}');
    expect(right).toBe(left);
  });

  test("writes what JSON.stringify writes, but for the key order", () => {
    const value = {
      date: new Date("2026-11-07T14:00:00Z"),
      day: Temporal.PlainDate.from("2026-11-07"),
      fn: (): number => 1,
      list: [undefined, Number.NaN, Number.POSITIVE_INFINITY, "x"],
      price: Decimal.from("99.50"),
      text: 'quote " and \n newline',
      missing: undefined,
    };
    expect(stableStringify(value)).toBe(
      String.raw`{"date":"2026-11-07T14:00:00.000Z","day":"2026-11-07","list":[null,null,null,"x"],"price":"99.50","text":"quote \" and \n newline"}`,
    );
    // Its keys are already in order, so JSON.stringify writes the same text.
    expect(stableStringify(value)).toBe(JSON.stringify(value));
    expect(stableStringify("x")).toBe('"x"');
    expect(stableStringify(-0)).toBe("0");
  });

  test.each([
    [10n, "10n has no JSON form: write it as a string, or as a Decimal."],
    [new Map(), "A Map has no JSON form: convert it first, with Object.fromEntries or [...set]."],
    [
      { ids: new Set([1]) },
      "A Set has no JSON form: convert it first, with Object.fromEntries or [...set].",
    ],
    [undefined, "A value of type undefined has no JSON form."],
    [(): number => 1, "A value of type function has no JSON form."],
  ])("refuses %o", (value, message) => {
    expect(() => stableStringify(value)).toThrow(new TypeError(message));
  });

  test("refuses a cycle, and writes a value seen twice without one", () => {
    const shared = { par: 1 };
    expect(stableStringify({ first: shared, second: shared })).toBe(
      '{"first":{"par":1},"second":{"par":1}}',
    );
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => stableStringify(cyclic)).toThrow(TypeError);
  });
});
