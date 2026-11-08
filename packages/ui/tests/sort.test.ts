import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import { sortBy } from "#utils/index.ts";
import type { SortKey } from "#utils/index.ts";

interface Row {
  readonly name: string;
  readonly sector: string | null;
  readonly yield: number | undefined;
  readonly price: number;
  readonly settles: Temporal.PlainDate;
  readonly tags: readonly string[];
}

function row(
  name: string,
  sector: string | null,
  [yieldValue, price]: readonly [yieldValue: number | undefined, price: string],
): Row {
  return {
    name,
    price: Number(price),
    sector,
    settles: Temporal.PlainDate.from("2026-11-09"),
    tags: [],
    yield: yieldValue,
  };
}

const rows = [
  row("Bond 10", "Utilities", [4.1, "99.5"]),
  row("Bond 2", "Energy", [5.2, "101.25"]),
  row("Bond 1", "Utilities", [undefined, "100"]),
  row("bond 3", null, [4.1, "98.75"]),
  row("Bond 4", "Energy", [Number.NaN, "100.5"]),
];

const names = (sorted: readonly Row[]): string[] => sorted.map(({ name }) => name);

describe("sortBy", () => {
  test("compares strings as people read them, numbers inside them included", () => {
    expect(names(sortBy(rows, ["name"]))).toEqual([
      "Bond 1",
      "Bond 2",
      "bond 3",
      "Bond 4",
      "Bond 10",
    ]);
  });

  test("breaks ties by the next criterion, each in its own order", () => {
    const sorted = sortBy(rows, ["sector", { by: "name", order: "desc" }]);
    expect(names(sorted)).toEqual(["Bond 4", "Bond 2", "Bond 10", "Bond 1", "bond 3"]);
  });

  test("puts missing values last in either order", () => {
    expect(names(sortBy(rows, ["yield"]))).toEqual([
      "Bond 10",
      "bond 3",
      "Bond 2",
      "Bond 1",
      "Bond 4",
    ]);
    expect(names(sortBy(rows, [{ by: "yield", order: "desc" }]))).toEqual([
      "Bond 2",
      "Bond 10",
      "bond 3",
      "Bond 1",
      "Bond 4",
    ]);
    expect(names(sortBy(rows, [{ by: "sector", order: "desc" }])).at(-1)).toBe("bond 3");
  });

  test("is stable, so items equal on every criterion keep their order", () => {
    expect(names(sortBy(rows, [(item): Temporal.PlainDate => item.settles]))).toEqual(names(rows));
  });

  test("compares numbers by value", () => {
    expect(names(sortBy(rows, [{ by: "price", order: "desc" }]))).toEqual([
      "Bond 2",
      "Bond 4",
      "Bond 1",
      "Bond 10",
      "bond 3",
    ]);
  });

  test("compares bigints and numbers together, and booleans false first", () => {
    expect(sortBy([3n, 1, 2n, 0.5], [(value): number | bigint => value])).toEqual([0.5, 1, 2n, 3n]);
    expect(sortBy([true, false, true], [(value): boolean => value])).toEqual([false, true, true]);
  });

  test("compares Dates and Temporal values by time, invalid Dates last", () => {
    const dates = [new Date("2026-03-01"), new Date(Number.NaN), new Date("2025-12-31")];
    expect(sortBy(dates, [(date): Date => date]).map((date) => date.getTime())).toEqual([
      Date.UTC(2025, 11, 31),
      Date.UTC(2026, 2, 1),
      Number.NaN,
    ]);
    const instants = [
      Temporal.ZonedDateTime.from("2026-11-07T09:30[America/New_York]"),
      Temporal.Instant.from("2026-11-07T14:00:00Z"),
    ];
    expect(
      sortBy(instants, [(instant): Temporal.Instant | Temporal.ZonedDateTime => instant]).map(
        String,
      ),
    ).toEqual(["2026-11-07T14:00:00Z", "2026-11-07T09:30:00-05:00[America/New_York]"]);
    const months = ["2026-11", "2025-02", "2026-01"].map((month) =>
      Temporal.PlainYearMonth.from(month),
    );
    expect(sortBy(months, [(month): Temporal.PlainYearMonth => month]).map(String)).toEqual([
      "2025-02",
      "2026-01",
      "2026-11",
    ]);
  });

  test("sorts values of different kinds by kind", () => {
    expect(sortBy(["b", 2, "a", 1, null], [(value): string | number | null => value])).toEqual([
      1,
      2,
      "a",
      "b",
      null,
    ]);
  });

  test("returns a new array", () => {
    const sorted = sortBy(rows, ["name"]);
    expect(sorted).not.toBe(rows);
    expect(names(rows)[0]).toBe("Bond 10");
  });

  test("accepts only keys whose values sort", () => {
    expectTypeOf<SortKey<Row>>().toEqualTypeOf<"name" | "sector" | "yield" | "price" | "settles">();
    expectTypeOf<SortKey<number>>().toBeNever();
    expectTypeOf<SortKey<string>>().toBeNever();
  });
});
