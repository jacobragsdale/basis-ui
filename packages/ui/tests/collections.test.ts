import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import {
  chunk,
  countBy,
  keyBy,
  maxBy,
  minBy,
  partition,
  range,
  uniqBy,
  zip,
} from "#utils/index.ts";

interface Trade {
  readonly id: string;
  readonly side: "buy" | "sell";
  readonly par: number;
}

const trades: readonly Trade[] = [
  { id: "T1", par: 5000, side: "buy" },
  { id: "T2", par: 250, side: "sell" },
  { id: "T3", par: 5000, side: "buy" },
  { id: "T4", par: 1000, side: "buy" },
];

describe("keyBy and countBy", () => {
  test("key items by what each gives, the later replacing the earlier", () => {
    const byPar = keyBy(trades, (trade) => trade.par);
    expect(byPar[5000]?.id).toBe("T3");
    expect(Object.keys(keyBy(trades, (trade) => trade.id))).toEqual(["T1", "T2", "T3", "T4"]);
    expectTypeOf(byPar).toEqualTypeOf<Partial<Record<number, Trade>>>();
  });

  test("count items by what each gives, a key no item gives being absent", () => {
    const bySide = countBy(trades, (trade) => trade.side);
    expect(bySide).toEqual({ buy: 3, sell: 1 });
    expect(countBy(trades.slice(0, 1), (trade) => trade.side)).toEqual({ buy: 1 });
    expectTypeOf(bySide).toEqualTypeOf<Partial<Record<"buy" | "sell", number>>>();
  });

  test("keep a key such as __proto__ as data", () => {
    const keyed = keyBy(["__proto__", "constructor"], (key) => key);
    expect(Object.keys(keyed)).toEqual(["__proto__", "constructor"]);
    expect(Object.getPrototypeOf(keyed)).toBe(Object.prototype);
  });

  test("pass the index and the array, as the array methods do", () => {
    expect(
      keyBy(["a", "b"], (_item, index, items) => `${String(index)}/${String(items.length)}`),
    ).toEqual({
      "0/2": "a",
      "1/2": "b",
    });
  });
});

describe("partition", () => {
  test("splits into the items that pass and those that fail, in order", () => {
    expect(partition([1, 2, 3, 4, 5], (value) => value % 2 === 0)).toEqual([
      [2, 4],
      [1, 3, 5],
    ]);
  });

  test("narrows both halves by a type guard", () => {
    const values: readonly (string | number)[] = ["a", 1, "b", 2];
    const [strings, numbers] = partition(values, (value) => typeof value === "string");
    expect([strings, numbers]).toEqual([
      ["a", "b"],
      [1, 2],
    ]);
    expectTypeOf(strings).toEqualTypeOf<string[]>();
    expectTypeOf(numbers).toEqualTypeOf<number[]>();
  });
});

describe("chunk", () => {
  test("splits into runs, the last holding what is left", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });

  test.each([0, -1, 1.5, Number.NaN])("refuses a size of %s", (size) => {
    expect(() => chunk([1], size)).toThrow(RangeError);
  });
});

test("uniqBy keeps the first item for each value", () => {
  expect(uniqBy(trades, (trade) => trade.par).map(({ id }) => id)).toEqual(["T1", "T2", "T4"]);
  expect(uniqBy([Number.NaN, 0, -0, Number.NaN], (value) => value)).toEqual([Number.NaN, 0]);
});

describe("minBy and maxBy", () => {
  test("find the first item with the smallest or largest value", () => {
    expect(minBy(trades, (trade) => trade.par)?.id).toBe("T2");
    expect(maxBy(trades, (trade) => trade.par)?.id).toBe("T1");
    expect(maxBy([], (value: number) => value)).toBeUndefined();
  });

  test("skip NaN values", () => {
    expect(maxBy([Number.NaN, 1, 3, 2], (value) => value)).toBe(3);
    expect(minBy([4, Number.NaN, 1], (value) => value)).toBe(1);
    expect(minBy(["x", "y"], () => Number.NaN)).toBe("x");
  });

  test("are not undefined for a list the types know is not empty", () => {
    const nonEmpty: readonly [Trade, ...Trade[]] = [trades[0] ?? { id: "", par: 0, side: "buy" }];
    expectTypeOf(maxBy(nonEmpty, (trade) => trade.par)).toEqualTypeOf<Trade>();
    expectTypeOf(maxBy(trades, (trade) => trade.par)).toEqualTypeOf<Trade | undefined>();
  });
});

describe("range", () => {
  test.each([
    [[4], [0, 1, 2, 3]],
    [
      [1, 5],
      [1, 2, 3, 4],
    ],
    [
      [0, 10, 3],
      [0, 3, 6, 9],
    ],
    [
      [0, -6, -2],
      [0, -2, -4],
    ],
    [[5, 1], []],
    [[0], []],
  ] as const)("range(%j) is %j", (args, values) => {
    const [start, end, step] = args;
    expect(range(start, end, step)).toEqual(values);
  });

  test.each([0, 0.5])("refuses a step of %s", (step) => {
    expect(() => range(0, 5, step)).toThrow(RangeError);
  });
});

describe("zip", () => {
  test("makes rows of the arrays' items", () => {
    expect(zip(["a", "b"], [1, 2])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect(zip([1, 2, 3])).toEqual([[1], [2], [3]]);
  });

  test("runs to the longest array, with undefined past the end of a shorter one, as lodash does", () => {
    const rows = zip(["a"], [1, 2], [true, false, true]);
    expect(rows).toEqual([
      ["a", 1, true],
      [undefined, 2, false],
      [undefined, undefined, true],
    ]);
    expectTypeOf(rows).toEqualTypeOf<
      [string | undefined, number | undefined, boolean | undefined][]
    >();
  });
});
