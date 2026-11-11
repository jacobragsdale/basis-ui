import "#styles.css";

import { DataTable, defineFilters } from "@basis/ui";
import type { DataTableProps, DataTableSort } from "@basis/ui";
import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { positionColumns } from "./columns.tsx";
import { DataTableAtItsCapSection } from "./data-table.tsx";
import { positions } from "./fixtures.ts";
import type { Position } from "./fixtures.ts";
import { columnText } from "./test-helpers.ts";

type Props = Partial<DataTableProps<Position>>;

/** The positions, selectable, with the props the test controls. */
function Positions(props: Props): ReactElement {
  return (
    <DataTable
      label="Positions"
      columns={positionColumns}
      data={positions}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.cusip}
      selectable
      {...props}
    />
  );
}

const bookFilters = defineFilters({
  book: { kind: "choice", label: "Book", options: ["Rates", "Agency", "Credit"] },
});

describe("DataTable's sort, controlled", () => {
  test("shows the sort it is given", async () => {
    const screen = await render(<Positions sorting={[{ desc: true, id: "par" }]} />);
    const table = screen.getByRole("table", { name: "Positions" });
    await expect
      .element(table.getByRole("columnheader", { name: "Par" }))
      .toHaveAttribute("aria-sort", "descending");
    expect(columnText(table, 4)[0]).toBe("50,000,000");
  });

  test("tells the app the sort a heading asks for, and keeps its own until the app takes it", async () => {
    const heard = vi.fn<(sorting: readonly DataTableSort[]) => void>();
    const byPar: readonly DataTableSort[] = [{ desc: true, id: "par" }];
    const screen = await render(<Positions sorting={byPar} onSortingChange={heard} />);
    const table = screen.getByRole("table", { name: "Positions" });
    await table.getByRole("button", { name: "Book" }).click();
    expect(heard).toHaveBeenLastCalledWith([{ desc: false, id: "book" }]);
    // The app has not taken the new sort, so the table keeps the one it was given.
    expect(columnText(table, 4)[0]).toBe("50,000,000");
    await screen.rerender(
      <Positions sorting={[{ desc: false, id: "book" }]} onSortingChange={heard} />,
    );
    await expect
      .element(table.getByRole("columnheader", { name: "Book" }))
      .toHaveAttribute("aria-sort", "ascending");
  });
});

describe("DataTable's filter, controlled", () => {
  test("shows the filter it is given, and tells the app the text typed once typing pauses", async () => {
    const heard = vi.fn<(filter: string) => void>();
    const screen = await render(<Positions filter="hedge" onFilterChange={heard} />);
    const filter = screen.getByRole("searchbox", { name: "Filter Positions" });
    await expect.element(filter).toHaveValue("hedge");
    const table = screen.getByRole("table", { name: "Positions" });
    expect(columnText(table, 1)).toStrictEqual(["91282CRM5", "91282CRJ2"]);
    await filter.fill("agency");
    await expect.poll(() => heard.mock.calls).toStrictEqual([["agency"]]);
    await screen.rerender(<Positions filter="agency" onFilterChange={heard} />);
    await expect.poll(() => columnText(table, 1)).toHaveLength(4);
  });

  test("a new filter from the app replaces what the box shows", async () => {
    const screen = await render(<Positions filter="hedge" />);
    await screen.rerender(<Positions filter="" />);
    await expect
      .element(screen.getByRole("searchbox", { name: "Filter Positions" }))
      .toHaveValue("");
    expect(columnText(screen.getByRole("table"), 1)).toHaveLength(12);
  });
});

describe("DataTable under a FilterBar's values", () => {
  test("keeps the rows the values keep, as filterRows does", async () => {
    const screen = await render(
      <Positions
        filterBy={{
          fields: { book: (row) => row.book },
          filters: bookFilters,
          values: { book: "Agency" },
        }}
      />,
    );
    const table = screen.getByRole("table", { name: "Positions" });
    expect(columnText(table, 3)).toStrictEqual(["Agency", "Agency", "Agency", "Agency"]);
    await expect.element(screen.getByText("0 of 4 selected")).toBeVisible();
  });

  test("keeps the selection of rows the values hide", async () => {
    const fields = { book: (row: Position): string => row.book };
    const screen = await render(
      <Positions filterBy={{ fields, filters: bookFilters, values: { book: "Agency" } }} />,
    );
    await screen.getByRole("checkbox", { name: "Select all rows" }).click();
    await expect.element(screen.getByText("4 of 4 selected")).toBeVisible();
    await screen.rerender(<Positions filterBy={{ fields, filters: bookFilters, values: {} }} />);
    await expect.element(screen.getByText("4 of 12 selected")).toBeVisible();
  });
});

describe("DataTable's columns, controlled", () => {
  test("hides the columns it is given, and tells the app the columns the menu hides", async () => {
    const heard = vi.fn<(hidden: readonly string[]) => void>();
    const screen = await render(
      <Positions hiddenColumns={["security"]} onHiddenColumnsChange={heard} />,
    );
    await expect
      .element(screen.getByRole("columnheader", { name: "Security" }))
      .not.toBeInTheDocument();
    await screen.getByRole("button", { name: "Columns" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Book" }).click();
    expect(heard).toHaveBeenLastCalledWith(["security", "book"]);
    await page.getByRole("menuitemcheckbox", { name: "Security" }).click();
    expect(heard).toHaveBeenLastCalledWith([]);
    await userEvent.keyboard("{Escape}");
    await expect.element(screen.getByRole("columnheader", { name: "Book" })).toBeVisible();
  });

  test("starts with the columns hidden that it is told to", async () => {
    const screen = await render(<Positions defaultHiddenColumns={["note", "settled"]} />);
    await expect
      .element(screen.getByRole("columnheader", { name: "Note" }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("columnheader", { name: "Settled" }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("columnheader", { name: "Book" })).toBeVisible();
  });
});

describe("DataTable's page, controlled", () => {
  test("shows the page it is given, and tells the app the page a button asks for", async () => {
    const heard = vi.fn<(page: number) => void>();
    const screen = await render(<Positions pageSize={8} page={1} onPageChange={heard} />);
    await expect.element(screen.getByText("Rows 9–12 of 12")).toBeVisible();
    await screen.getByRole("button", { name: "Previous page" }).click();
    expect(heard).toHaveBeenLastCalledWith(0);
    await expect.element(screen.getByText("Rows 9–12 of 12")).toBeVisible();
  });

  test("starts on the page it is told to, and a new filter goes back to the first", async () => {
    const screen = await render(<Positions pageSize={4} defaultPage={2} />);
    await expect.element(screen.getByText("Rows 9–12 of 12")).toBeVisible();
    await screen.getByRole("searchbox", { name: "Filter Positions" }).fill("Rates");
    await expect.element(screen.getByText("Rows 1–4 of 4")).toBeVisible();
  });

  test("a page past the rows the filter keeps shows the last page", async () => {
    const screen = await render(<Positions pageSize={4} page={2} />);
    await screen.rerender(<Positions pageSize={4} page={2} filter="Agency" />);
    await expect.element(screen.getByText("Rows 1–4 of 4")).toBeVisible();
  });
});

describe("DataTable's selection, controlled", () => {
  test("selects the ids it is given, and tells the app the selection a checkbox asks for", async () => {
    const heard = vi.fn<(rows: readonly Position[], ids: readonly string[]) => void>();
    const screen = await render(
      <Positions selectedIds={["rates-91282CRT0"]} onSelectionChange={heard} />,
    );
    await expect.element(screen.getByRole("checkbox", { name: "Select 91282CRT0" })).toBeChecked();
    await expect.element(screen.getByText("1 of 12 selected")).toBeVisible();
    await screen.getByRole("checkbox", { name: "Select 91282CRV5" }).click();
    expect(heard).toHaveBeenLastCalledWith(
      positions.filter((row) => ["91282CRV5", "91282CRT0"].includes(row.cusip)),
      ["rates-91282CRV5", "rates-91282CRT0"],
    );
    // The app has not taken it, so the table shows the selection it was given.
    await expect
      .element(screen.getByRole("checkbox", { name: "Select 91282CRV5" }))
      .not.toBeChecked();
    await screen.rerender(
      <Positions selectedIds={["rates-91282CRT0", "rates-91282CRV5"]} onSelectionChange={heard} />,
    );
    await expect.element(screen.getByText("2 of 12 selected")).toBeVisible();
  });

  test("starts with the ids selected that it is told to, among the rows it holds", async () => {
    const screen = await render(
      <Positions defaultSelectedIds={["rates-91282CRT0", "agency-91282CRQ6", "gone"]} />,
    );
    await expect.element(screen.getByText("2 of 12 selected")).toBeVisible();
  });
});

describe("the gallery's table at its row cap", () => {
  test("shows 50 of its 2,000 rows a page, and the state the page holds", async () => {
    const screen = await render(<DataTableAtItsCapSection />);
    await expect.element(screen.getByText("Rows 1–50 of 2,000")).toBeVisible();
    await expect
      .element(screen.getByText("Sorted by par descending; page 1; 0 selected."))
      .toBeVisible();
    await screen.getByRole("button", { name: "Next page" }).click();
    await screen.getByRole("checkbox", { name: "Select all rows" }).click();
    await expect
      .element(screen.getByText("Sorted by par descending; page 2; 2,000 selected."))
      .toBeVisible();
    await screen.getByRole("button", { name: "Book" }).click();
    await expect
      .element(screen.getByText("Sorted by book ascending; page 1; 2,000 selected."))
      .toBeVisible();
  });
});
