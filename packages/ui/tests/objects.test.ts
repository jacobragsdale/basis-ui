import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import {
  assertNever,
  entries,
  fromEntries,
  invariant,
  isPresent,
  keys,
  mapValues,
  omit,
  pick,
} from "#utils/index.ts";

interface Bond {
  readonly cusip: string;
  readonly coupon: number;
  readonly callable: boolean;
  readonly rating?: string;
}

const bond: Bond = { callable: false, coupon: 4.25, cusip: "000000AA0" };

describe("pick and omit", () => {
  test("pick makes a new object of the listed keys the object has", () => {
    const picked = pick(bond, ["cusip", "coupon", "rating"]);
    expect(picked).toEqual({ coupon: 4.25, cusip: "000000AA0" });
    expect(Object.hasOwn(picked, "rating")).toBe(false);
    expectTypeOf(picked).toEqualTypeOf<Pick<Bond, "cusip" | "coupon" | "rating">>();
  });

  test("omit makes a new object of every other key", () => {
    const omitted = omit(bond, ["callable"]);
    expect(omitted).toEqual({ coupon: 4.25, cusip: "000000AA0" });
    expect(omitted).not.toBe(bond);
    expectTypeOf(omitted).toEqualTypeOf<Omit<Bond, "callable">>();
  });

  test("mapValues keeps the keys and replaces the values", () => {
    const prices = { bid: 99.5, offer: 101.25 };
    const shown = mapValues(prices, (price, key) => `${key}: ${price.toFixed(2)}`);
    expect(shown).toEqual({ bid: "bid: 99.50", offer: "offer: 101.25" });
    expectTypeOf(shown).toEqualTypeOf<Record<"bid" | "offer", string>>();
  });
});

describe("typed keys, entries and fromEntries", () => {
  test("keys and entries are typed by the object", () => {
    const limits = { dv01: 50_000, notional: 25_000_000 };
    const names = keys(limits);
    expect(names).toEqual(["dv01", "notional"]);
    expectTypeOf(names).toEqualTypeOf<("dv01" | "notional")[]>();
    expect(entries(limits)).toEqual([
      ["dv01", 50_000],
      ["notional", 25_000_000],
    ]);
  });

  test("keys and entries leave out inherited keys", () => {
    const child = { own: 2 };
    Object.setPrototypeOf(child, { inherited: 1 });
    expect(keys(child)).toEqual(["own"]);
    expect(entries(child)).toEqual([["own", 2]]);
  });

  test("fromEntries types its keys, and may lack some", () => {
    const sides = fromEntries([
      ["buy", 1],
      ["sell", -1],
    ] as const);
    expect(sides).toEqual({ buy: 1, sell: -1 });
    expectTypeOf(sides).toEqualTypeOf<Partial<Record<"buy" | "sell", 1 | -1>>>();
    expect(Object.keys(fromEntries([["__proto__", 1]]))).toEqual(["__proto__"]);
  });
});

describe("guards", () => {
  test("isPresent narrows away null and undefined, and keeps 0 and the empty string", () => {
    const values = [0, null, "", undefined, Number.NaN];
    const present = values.filter((value) => isPresent(value));
    expect(present).toEqual([0, "", Number.NaN]);
    expectTypeOf(present).toEqualTypeOf<(string | number)[]>();
  });

  test("invariant throws with its message unless the condition holds, and narrows after", () => {
    const rows = new Map([["T1", 5000]]);
    const par = rows.get("T1");
    invariant(par !== undefined, "T1 is in the table.");
    expectTypeOf(par).toEqualTypeOf<number>();
    expect(() => {
      invariant(rows.has("T9"), "T9 is in the table.");
    }).toThrow("T9 is in the table.");
  });

  test("assertNever fails the build for an unhandled case, and throws if one arrives anyway", () => {
    type Side = "buy" | "sell";
    function sign(side: Side): number {
      switch (side) {
        case "buy": {
          return 1;
        }
        case "sell": {
          return -1;
        }
        default: {
          return assertNever(side);
        }
      }
    }
    expect(sign("sell")).toBe(-1);
    // Reflect.apply passes values the types rule out, as data from outside the types can.
    expect(() => {
      Reflect.apply(sign, undefined, ["short"]);
    }).toThrow('Unexpected value: "short".');
    expect(() => {
      Reflect.apply(assertNever, undefined, [undefined, "No side."]);
    }).toThrow("No side.");
  });
});
