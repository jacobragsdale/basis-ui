import "#styles.css";

import { DataTable } from "@basis/ui";
import type { DataTableColumn, DataTableProps, DataTableRowAction } from "@basis/ui";
import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { positionColumns } from "./columns.tsx";
import { positions } from "./fixtures.ts";
import type { Position } from "./fixtures.ts";
import { columnText } from "./test-helpers.ts";

type Props = Partial<DataTableProps<Position>>;

function Positions(props: Props): ReactElement {
  return (
    <DataTable
      label="Positions"
      columns={positionColumns}
      data={positions}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.cusip}
      {...props}
    />
  );
}

/** `count` positions, each with its own id. */
function manyRows(count: number): readonly Position[] {
  return Array.from({ length: count }, (_unused, index) => index).flatMap((index) => {
    const row = positions[index % positions.length];
    return row === undefined ? [] : [{ ...row, id: `p${String(index)}` }];
  });
}

describe("DataTable's pages by default", () => {
  test("a table of more rows than a page shows 50 a page", async () => {
    const screen = await render(<Positions data={manyRows(120)} />);
    await expect.element(screen.getByText("Rows 1–50 of 120")).toBeVisible();
    expect(columnText(screen.getByRole("table"), 0)).toHaveLength(50);
  });

  test("a table that fits on a page shows no pages", async () => {
    const screen = await render(<Positions />);
    await expect.element(screen.getByRole("table")).toBeVisible();
    await expect
      .element(screen.getByRole("navigation", { name: "Positions, pages" }))
      .not.toBeInTheDocument();
  });
});

describe("DataTable's filter", () => {
  test("matches the text a number shows, not its digits alone", async () => {
    const screen = await render(<Positions />);
    const filter = screen.getByRole("searchbox", { name: "Filter Positions" });
    await filter.fill("7,500,000");
    await expect.poll(() => columnText(screen.getByRole("table"), 0)).toStrictEqual(["91282CRM5"]);
    // A price in 32nds, as its cell shows it.
    await filter.fill("99-31");
    await expect.poll(() => columnText(screen.getByRole("table"), 0)).toStrictEqual(["91282CRT0"]);
  });

  test("matches the text a column says it shows", async () => {
    interface Trade {
      readonly id: string;
      readonly side: "B" | "S";
    }
    const columns: readonly DataTableColumn<Trade>[] = [
      { header: "Trade", id: "id", value: (row) => row.id },
      {
        cell: (row) => (row.side === "B" ? "Buy" : "Sell"),
        header: "Side",
        id: "side",
        text: (row) => (row.side === "B" ? "Buy" : "Sell"),
        value: (row) => row.side,
      },
    ];
    const trades: readonly Trade[] = [
      { id: "T1", side: "B" },
      { id: "T2", side: "S" },
    ];
    const screen = await render(
      <DataTable label="Trades" columns={columns} data={trades} getRowId={(row) => row.id} />,
    );
    await screen.getByRole("searchbox", { name: "Filter Trades" }).fill("sell");
    await expect.poll(() => columnText(screen.getByRole("table"), 0)).toStrictEqual(["T2"]);
  });

  test("filters once typing pauses, not at every key", async () => {
    const heard = vi.fn<(filter: string) => void>();
    const screen = await render(<Positions onFilterChange={heard} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Filter Positions" }), "hedge");
    await expect.poll(() => columnText(screen.getByRole("table"), 0)).toHaveLength(2);
    expect(heard.mock.calls).toStrictEqual([["hedge"]]);
  });

  test("Enter filters at once", async () => {
    const screen = await render(<Positions />);
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Filter Positions" }),
      "hedge{Enter}",
    );
    expect(columnText(screen.getByRole("table"), 0)).toHaveLength(2);
  });
});

describe("DataTable's row menu", () => {
  test("asks for a row's actions only when its menu opens", async () => {
    const actions = vi.fn<(row: Position) => readonly DataTableRowAction[]>((row) => [
      { label: `Allocate ${row.cusip}`, onSelect: vi.fn<() => void>() },
    ]);
    const screen = await render(<Positions rowActions={actions} />);
    await expect.element(screen.getByRole("table")).toBeVisible();
    expect(actions).not.toHaveBeenCalled();
    await screen.getByRole("button", { name: "Actions for 91282CRT0" }).click();
    await expect.element(page.getByRole("menuitem", { name: "Allocate 91282CRT0" })).toBeVisible();
    expect(new Set(actions.mock.calls.map(([row]) => row.cusip))).toStrictEqual(
      new Set(["91282CRT0"]),
    );
  });

  test("opens from the keyboard, runs an action, and gives the focus back to its button", async () => {
    const allocate = vi.fn<() => void>();
    const screen = await render(
      <Positions rowActions={() => [{ label: "Allocate", onSelect: allocate }]} />,
    );
    const button = screen.getByRole("button", { name: "Actions for 91282CRT0" });
    button.element().focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("menuitem", { name: "Allocate" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(allocate).toHaveBeenCalledOnce();
    await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Actions for 91282CRT0" }))
      .toHaveFocus();
  });

  test("Escape closes it, with the focus on its button", async () => {
    const screen = await render(
      <Positions rowActions={() => [{ label: "Allocate", onSelect: vi.fn<() => void>() }]} />,
    );
    await screen.getByRole("button", { name: "Actions for 91282CRV5" }).click();
    await expect.element(page.getByRole("menu")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Actions for 91282CRV5" }))
      .toHaveFocus();
  });
});

describe("DataTable's row checkboxes", () => {
  test("Space toggles a row's checkbox from the keyboard", async () => {
    const screen = await render(<Positions selectable />);
    const box = screen.getByRole("checkbox", { name: "Select 91282CRT0" });
    box.element().focus();
    await userEvent.keyboard(" ");
    await expect.element(box).toBeChecked();
    await expect.element(screen.getByText("1 of 12 selected")).toBeVisible();
    await userEvent.keyboard(" ");
    await expect.element(box).not.toBeChecked();
  });

  test("a focused checkbox shows the focus ring", async () => {
    const screen = await render(<Positions selectable />);
    screen.getByRole("checkbox", { name: "Select 91282CRT0" }).element().focus();
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}{Tab}");
    const box = screen.getByRole("checkbox", { name: "Select 91282CRT0" }).element();
    await expect.element(box).toHaveFocus();
    const drawn = box.parentElement?.querySelector('[data-slot="checkbox-box"]');
    expect(drawn ? getComputedStyle(drawn).outlineStyle : "none").toBe("solid");
  });
});

describe("DataTable's rows", () => {
  test("onRowClick hears the row a click lands on, but not a click on its controls", async () => {
    const clicked = vi.fn<(row: Position) => void>();
    const screen = await render(
      <Positions
        selectable
        onRowClick={clicked}
        rowActions={() => [{ label: "Allocate", onSelect: vi.fn<() => void>() }]}
      />,
    );
    await screen.getByRole("cell", { name: "UST 4.750% 10/31/2031" }).click();
    expect(clicked).toHaveBeenCalledExactlyOnceWith(positions[1]);
    await screen.getByRole("checkbox", { name: "Select 91282CRT0" }).click();
    await screen.getByRole("link", { name: "91282CRT0" }).click();
    await screen.getByRole("button", { name: "Actions for 91282CRT0" }).click();
    await userEvent.keyboard("{Escape}");
    expect(clicked).toHaveBeenCalledOnce();
  });

  test("the header stays in view as the rows scroll under it", async () => {
    const screen = await render(<Positions data={manyRows(40)} pageSize={40} className="h-80" />);
    const heading = screen.getByRole("columnheader", { name: "Book" }).element();
    const scroller = heading.closest('[data-slot="table-container"]');
    expect(scroller).not.toBeNull();
    const { top } = heading.getBoundingClientRect();
    scroller?.scrollBy({ top: 400 });
    await expect.poll(() => scroller?.scrollTop).toBeGreaterThan(300);
    expect(heading.getBoundingClientRect().top).toBeCloseTo(top, 0);
  });

  test("a column takes the width it is given", async () => {
    const book: DataTableColumn<Position> = {
      header: "Book",
      id: "book",
      value: (row) => row.book,
      width: 200,
    };
    const columns = positionColumns.map((column) => (column.id === "book" ? book : column));
    const screen = await render(<Positions columns={columns} />);
    const heading = screen.getByRole("columnheader", { name: "Book" }).element();
    expect(heading.getBoundingClientRect().width).toBe(200);
    const cell = screen.getByRole("cell", { name: "Agency" }).first().element();
    expect(cell.getBoundingClientRect().width).toBe(200);
  });
});
