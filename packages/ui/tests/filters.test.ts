/* The filter bar's definitions, the schema its route validates search parameters with, the rows its values keep, and
 * an active filter in words. The bar itself, the address and history, are tested in the gallery, in a browser. */

import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import { z } from "zod";

import { defineFilters, filterRows, filterSearchSchema } from "@basis/ui";
import type { FilterFields, FilterValues } from "@basis/ui";

import { filterValueText } from "#components/filter-text.ts";

const tradeFilters = defineFilters({
  issuer: { kind: "text", label: "Issuer" },
  book: {
    kind: "choice",
    label: "Book",
    options: [
      { label: "Rates trading", value: "rates" },
      { label: "Credit trading", value: "credit" },
    ],
  },
  desks: { kind: "multiChoice", label: "Desks", options: ["UST", "Agency", "IG"] },
  settles: { kind: "dateRange", label: "Settles" },
  par: { kind: "numberRange", label: "Par" },
});

type TradeFilters = FilterValues<typeof tradeFilters>;

interface Trade {
  readonly id: string;
  readonly issuer: string;
  readonly book: string;
  readonly desk: string;
  readonly settles: Temporal.PlainDate;
  readonly par: number | null;
}

function trade(id: string, issuer: string, [book, desk]: readonly [string, string]): Trade {
  return {
    book,
    desk,
    id,
    issuer,
    par: Number(id) * 1_000_000,
    settles: Temporal.PlainDate.from(`2026-11-0${id}`),
  };
}

const trades: readonly Trade[] = [
  trade("1", "US Treasury", ["rates", "UST"]),
  trade("2", "Fannie Mae", ["rates", "Agency"]),
  trade("3", "Apple Inc", ["credit", "IG"]),
  trade("4", "Treasury of Canada", ["credit", "IG"]),
  { ...trade("5", "Freddie Mac", ["rates", "Agency"]), par: null },
];

const fields: FilterFields<Trade, typeof tradeFilters> = {
  book: (row) => row.book,
  desks: (row) => row.desk,
  issuer: (row) => row.issuer,
  par: (row) => row.par,
  settles: (row) => row.settles,
};

function kept(values: TradeFilters): readonly string[] {
  return filterRows(trades, { fields, filters: tradeFilters, values }).map(({ id }) => id);
}

describe(defineFilters, () => {
  test("returns the filters as written, each choice's options as their literal values", () => {
    expect(tradeFilters.book.options).toHaveLength(2);
    expectTypeOf<TradeFilters["book"]>().toEqualTypeOf<"rates" | "credit" | undefined>();
    expectTypeOf<TradeFilters["desks"]>().toEqualTypeOf<
      readonly ("UST" | "Agency" | "IG")[] | undefined
    >();
    expectTypeOf<TradeFilters["issuer"]>().toEqualTypeOf<string | undefined>();
  });

  test("refuses a choice with no options, in one line with the fix", () => {
    expect(() => defineFilters({ book: { kind: "choice", label: "Book", options: [] } })).toThrow(
      "ERROR the filter book has no options. Give it at least one in options.",
    );
  });

  test("refuses an option listed twice, or one whose value is empty", () => {
    expect(() =>
      defineFilters({ desks: { kind: "multiChoice", label: "Desks", options: ["UST", "UST"] } }),
    ).toThrow("ERROR the filter desks lists the option UST twice. Give each option its own value.");
    expect(() => defineFilters({ book: { kind: "choice", label: "Book", options: [""] } })).toThrow(
      "ERROR the filter book has an option whose value is empty. Give each option a value, since an empty one cannot be told from no choice.",
    );
  });

  test("refuses a filter with no name", () => {
    expect(() => defineFilters({ "": { kind: "text", label: "Issuer" } })).toThrow(
      "ERROR a filter has an empty name. Name each filter by its search parameter, such as issuer.",
    );
  });
});

describe(filterSearchSchema, () => {
  const schema = filterSearchSchema(tradeFilters);

  test("reads each filter's search parameter, every one optional", () => {
    const search = {
      book: "rates",
      desks: ["UST", "IG"],
      issuer: "treasury",
      par: { min: 5_000_000 },
      settles: { end: "2026-11-30", start: "2026-11-02" },
    };
    expect(schema.parse(search)).toStrictEqual(search);
    expect(schema.parse({})).toStrictEqual({});
  });

  test("reads a value the filter cannot take as absent, so a stale link opens with the rest of its filters", () => {
    expect(
      schema.parse({
        book: "equities",
        desks: ["UST", "Munis"],
        issuer: "",
        par: {},
        settles: { end: "2026-11-02", start: "2026-11-30" },
      }),
    ).toEqual({});
    expect(schema.parse({ book: 7, issuer: "apple", par: { max: 1, min: 2 } })).toEqual({
      issuer: "apple",
    });
    expect(schema.parse({ settles: { end: "30 Nov", start: "2026-11-02" } })).toEqual({});
  });

  test("leaves out search parameters that are not filters, and extends with the route's own", () => {
    expect(schema.parse({ issuer: "apple", selected: "t1" })).toStrictEqual({ issuer: "apple" });
    const extended = schema.extend({ selected: z.string().optional() });
    expect(extended.parse({ issuer: "apple", selected: "t1" })).toStrictEqual({
      issuer: "apple",
      selected: "t1",
    });
  });

  test("types its input and output as the filters' values, so the router types a link's search", () => {
    expectTypeOf<z.output<typeof schema>>().toEqualTypeOf<{
      issuer?: string | undefined;
      book?: "rates" | "credit" | undefined;
      desks?: readonly ("UST" | "Agency" | "IG")[] | undefined;
      settles?: { readonly start: string; readonly end: string } | undefined;
      par?: { readonly min?: number | undefined; readonly max?: number | undefined } | undefined;
    }>();
    expectTypeOf<z.input<typeof schema>>().toEqualTypeOf<z.output<typeof schema>>();
  });

  test("is made once for the same filters", () => {
    expect(filterSearchSchema(tradeFilters)).toBe(schema);
  });

  test("refuses filters defineFilters would refuse", () => {
    expect(() =>
      filterSearchSchema({ book: { kind: "choice", label: "Book", options: [] } }),
    ).toThrow("ERROR the filter book has no options.");
  });
});

describe(filterRows, () => {
  test("keeps every row while no filter is active, as the same array", () => {
    expect(filterRows(trades, { fields, filters: tradeFilters, values: {} })).toBe(trades);
  });

  test("text keeps the rows whose field holds it, ignoring case", () => {
    expect(kept({ issuer: "TREASURY" })).toStrictEqual(["1", "4"]);
  });

  test("a choice keeps its option's rows, and several choices any of theirs", () => {
    expect(kept({ book: "credit" })).toStrictEqual(["3", "4"]);
    expect(kept({ desks: ["UST", "Agency"] })).toStrictEqual(["1", "2", "5"]);
  });

  test("a date range keeps the days from its start to its end, both included", () => {
    expect(kept({ settles: { end: "2026-11-04", start: "2026-11-02" } })).toStrictEqual([
      "2",
      "3",
      "4",
    ]);
  });

  test("a number range keeps the numbers inside it, either end open, and never a row without one", () => {
    expect(kept({ par: { max: 4_000_000, min: 2_000_000 } })).toStrictEqual(["2", "3", "4"]);
    expect(kept({ par: { min: 4_000_000 } })).toStrictEqual(["4"]);
    expect(kept({ par: { max: 1_000_000 } })).toStrictEqual(["1"]);
  });

  test("keeps the rows every active filter keeps", () => {
    expect(kept({ book: "rates", issuer: "mae" })).toStrictEqual(["2"]);
    expect(kept({ book: "credit", par: { max: 3_000_000 } })).toStrictEqual(["3"]);
  });

  test("text matches a list of a row's fields, and a date as ISO 8601 text", () => {
    const rows = [
      { names: ["Apple Inc", "AAPL"], settles: "2026-11-03T15:00:00Z" },
      { names: ["Microsoft", "MSFT"], settles: "2026-12-01" },
    ];
    const filters = defineFilters({
      name: { kind: "text", label: "Name" },
      settles: { kind: "dateRange", label: "Settles" },
    });
    const keep = (values: FilterValues<typeof filters>): number =>
      filterRows(rows, {
        fields: { name: (row) => row.names, settles: (row) => row.settles },
        filters,
        values,
      }).length;
    expect(keep({ name: "aapl" })).toBe(1);
    expect(keep({ settles: { end: "2026-11-30", start: "2026-11-01" } })).toBe(1);
  });
});

describe("an active filter in words", () => {
  test("shows text as typed, and a choice by its options' labels", () => {
    expect(filterValueText(tradeFilters.issuer, "apple")).toBe("apple");
    expect(filterValueText(tradeFilters.book, "credit")).toBe("Credit trading");
    expect(filterValueText(tradeFilters.desks, ["UST", "IG"])).toBe("UST, IG");
  });

  test("shows a range of days, or one day once", () => {
    expect(filterValueText(tradeFilters.settles, { end: "2026-11-30", start: "2026-11-02" })).toBe(
      "2026-11-02 – 2026-11-30",
    );
    expect(filterValueText(tradeFilters.settles, { end: "2026-11-02", start: "2026-11-02" })).toBe(
      "2026-11-02",
    );
  });

  test("shows a range of numbers in full, either end open", () => {
    expect(filterValueText(tradeFilters.par, { max: 25_000_000, min: 5_000_000 })).toBe(
      "5,000,000 – 25,000,000",
    );
    expect(filterValueText(tradeFilters.par, { min: 0.0025 })).toBe("at least 0.0025");
    expect(filterValueText(tradeFilters.par, { max: 1_500_000 })).toBe("at most 1,500,000");
  });
});
