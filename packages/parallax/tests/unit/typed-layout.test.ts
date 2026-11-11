import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import type { LayoutInput } from "#layout/layout.ts";
import type { LayoutFor } from "#layout/typed.ts";

/** Rows of a known type, as `useDataset<Position>` names them. */
interface Position {
  readonly ticker: string;
  readonly desk: string;
  readonly market_value: number;
}

describe("a layout typed by a dataset's rows", () => {
  test("names only the rows' columns, wherever a layout names one", () => {
    const good: LayoutFor<Position> = {
      cells: { market_value: { kind: "bar" } },
      columns: ["ticker", "market_value"],
      filters: [{ column: "desk", op: "eq", value: "Rates" }],
      formats: { market_value: { decimals: 0 } },
      measures: [{ aggregate: "sum", column: "market_value" }],
      sort: [{ column: "market_value", descending: true }],
    };
    // @ts-expect-error -- "tickr" is no column of Position.
    const column: LayoutFor<Position> = { columns: ["tickr"] };
    // @ts-expect-error -- a sort by a column Position does not have.
    const sort: LayoutFor<Position> = { sort: [{ column: "price" }] };
    // @ts-expect-error -- a format for a column Position does not have.
    const format: LayoutFor<Position> = { formats: { mv: { decimals: 0 } } };
    expectTypeOf(good).toExtend<LayoutInput>();
    expect([good, column, sort, format]).toHaveLength(4);
  });

  test("takes any name for rows of no known type, as LayoutInput does", () => {
    expectTypeOf<LayoutFor<object>>().toEqualTypeOf<LayoutInput>();
    expectTypeOf<LayoutFor<Record<string, unknown>>>().toEqualTypeOf<LayoutInput>();
  });
});
