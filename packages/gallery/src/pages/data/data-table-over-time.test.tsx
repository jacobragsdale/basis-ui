/* DataTable as its props change over time: columns whose values depend on the page's state while the data stays the
 * same array. */

import "#styles.css";

import { DataTable } from "@basis/ui";
import type { DataTableColumn } from "@basis/ui";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { columnText } from "./test-helpers.ts";

interface Bond {
  readonly id: string;
  readonly yield: number;
  readonly issuer: string;
}

const bonds: readonly Bond[] = [
  { id: "a", issuer: "alpha", yield: 4.1 },
  { id: "b", issuer: "beta", yield: 4.4 },
  { id: "c", issuer: "gamma", yield: 4.6 },
];

/** No issuer's name yet, as before a second query answers. */
const noNames: Readonly<Record<string, string>> = {};

/** The bonds, with a spread from `benchmark` and issuers named by `names`, sorted by spread ascending. */
function Spreads({
  benchmark,
  names = noNames,
}: {
  readonly benchmark: number;
  readonly names?: Readonly<Record<string, string>>;
}): ReactElement {
  const columns: DataTableColumn<Bond>[] = [
    { header: "Id", id: "id", value: (row) => row.id },
    {
      header: "Issuer",
      id: "issuer",
      value: (row) => names[row.issuer] ?? "",
    },
    {
      header: "Spread",
      id: "spread",
      value: (row) => Math.round(Math.abs(row.yield - benchmark) * 100),
      variant: "numeric",
    },
  ];
  return (
    <DataTable
      label="Bonds"
      columns={columns}
      data={bonds}
      getRowId={(row) => row.id}
      defaultSorting={[{ id: "spread" }]}
    />
  );
}

const table = page.getByRole("table", { name: "Bonds" });

describe("DataTable over time", () => {
  test("sorts by the columns' values as they are now, when the columns change and the data does not", async () => {
    const screen = await render(<Spreads benchmark={4} />);
    await expect.poll(() => columnText(table, 0)).toStrictEqual(["a", "b", "c"]);
    await screen.rerender(<Spreads benchmark={4.7} />);
    await expect.poll(() => columnText(table, 0)).toStrictEqual(["c", "b", "a"]);
    await expect.poll(() => columnText(table, 2)).toStrictEqual(["10.00", "30.00", "60.00"]);
  });

  test("filters by a column's text as it is now, once the names it shows arrive", async () => {
    const screen = await render(<Spreads benchmark={4} />);
    await userEvent.fill(page.getByRole("searchbox"), "Beta");
    await expect.element(page.getByText(/^No rows match/u)).toBeVisible();
    await screen.rerender(<Spreads benchmark={4} names={{ beta: "Beta Corp" }} />);
    await expect.poll(() => columnText(table, 0)).toStrictEqual(["b"]);
  });
});
