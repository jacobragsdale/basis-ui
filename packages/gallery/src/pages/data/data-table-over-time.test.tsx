/* DataTable as its props change over time: columns whose values depend on the page's state while the data stays the
 * same array. */

import "#styles.css";

import { DataTable } from "@basis/ui";
import type { DataTableColumn } from "@basis/ui";
import { useState } from "react";
import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
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

/** 120 bonds, three pages of 50. */
const many: readonly Bond[] = Array.from({ length: 120 }, (_unused, index) => ({
  id: `b${String(index).padStart(3, "0")}`,
  issuer: index % 2 === 0 ? "rates" : "credit",
  yield: 4 + index / 100,
}));

const plainColumns: DataTableColumn<Bond>[] = [
  { header: "Id", id: "id", value: (row) => row.id },
  { header: "Issuer", id: "issuer", value: (row) => row.issuer },
];

/** The bonds, whose page and filter the app keeps as an address does, dropping each default: `page || undefined`. */
function AddressHeld(): ReactElement {
  const [address, setAddress] = useState<{
    readonly page?: number | undefined;
    readonly query?: string | undefined;
  }>({});
  return (
    <>
      <DataTable
        label="Bonds"
        columns={plainColumns}
        data={many}
        getRowId={(row) => row.id}
        page={address.page}
        onPageChange={(next) => {
          setAddress((held) => ({ ...held, page: next === 0 ? undefined : next }));
        }}
        filter={address.query}
        onFilterChange={(next) => {
          setAddress((held) => ({ ...held, query: next === "" ? undefined : next }));
        }}
      />
      <output aria-label="Address">{JSON.stringify(address)}</output>
    </>
  );
}

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

  test("a page the app drops back to undefined is the first page, not the table's last own one", async () => {
    await render(<AddressHeld />);
    const next = page.getByRole("button", { name: "Next page" });
    const previous = page.getByRole("button", { name: "Previous page" });
    await next.click();
    await next.click();
    await previous.click();
    await previous.click();
    await expect.element(page.getByRole("status", { name: "Address" })).toHaveTextContent("{}");
    await expect.poll(() => columnText(table, 0)[0]).toBe("b000");
  });

  test("a filter the app drops back to undefined is no filter, not the first text typed", async () => {
    await render(<AddressHeld />);
    const box = page.getByRole("searchbox");
    await userEvent.fill(box, "b11");
    await expect.poll(() => columnText(table, 0)).toHaveLength(10);
    await userEvent.fill(box, "");
    await userEvent.keyboard("{Enter}");
    await expect.element(box).toHaveValue("");
    await expect.poll(() => columnText(table, 0)).toHaveLength(50);
  });

  test("tells the app the selected rows the filter keeps, as the toolbar counts them, and again as it narrows", async () => {
    const onSelectionChange = vi.fn<(rows: readonly Bond[], ids: readonly string[]) => void>();
    await render(
      <DataTable
        label="Bonds"
        columns={plainColumns}
        data={bonds}
        getRowId={(row) => row.id}
        selectable
        onSelectionChange={onSelectionChange}
      />,
    );
    await page.getByRole("checkbox", { name: "Select all rows" }).click();
    expect(onSelectionChange.mock.lastCall?.[1]).toStrictEqual(["a", "b", "c"]);
    await userEvent.fill(page.getByRole("searchbox"), "beta");
    await expect.poll(() => onSelectionChange.mock.lastCall?.[1]).toStrictEqual(["b"]);
    await expect.element(page.getByText("1 of 1 selected")).toBeVisible();
  });

  test("data not yet loaded shows the loading rows, never that there are none", async () => {
    await render(
      <DataTable
        label="Bonds"
        columns={plainColumns}
        data={undefined}
        getRowId={(row) => row.id}
      />,
    );
    await expect.element(table).toHaveAttribute("aria-busy", "true");
    await expect.element(page.getByText("No rows to show.")).not.toBeInTheDocument();
  });
});
