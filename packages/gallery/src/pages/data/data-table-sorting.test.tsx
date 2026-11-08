import "#styles.css";

import { DataTable } from "@basis/ui";
import type { DataTableColumn } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { positionColumns } from "./columns.tsx";
import { positions } from "./fixtures.ts";
import { columnText } from "./test-helpers.ts";

/** The positions, every row on one page, CUSIP first. */
async function renderPositions(): Promise<Awaited<ReturnType<typeof render>>> {
  return render(
    <DataTable
      label="Positions"
      columns={positionColumns}
      data={positions}
      getRowId={(row) => row.id}
    />,
  );
}

describe("DataTable sorting", () => {
  test("a heading sorts its column ascending, then descending", async () => {
    const screen = await renderPositions();
    const table = screen.getByRole("table", { name: "Positions" });
    const heading = table.getByRole("columnheader", { name: "Book" });
    const sort = table.getByRole("button", { name: "Book" });
    await sort.click();
    await expect.element(heading).toHaveAttribute("aria-sort", "ascending");
    expect(new Set(columnText(table, 2).slice(0, 4))).toStrictEqual(new Set(["Agency"]));
    await sort.click();
    await expect.element(heading).toHaveAttribute("aria-sort", "descending");
    expect(new Set(columnText(table, 2).slice(0, 4))).toStrictEqual(new Set(["Rates"]));
  });

  test("a third press puts the rows back in the data's order", async () => {
    const screen = await renderPositions();
    const table = screen.getByRole("table", { name: "Positions" });
    const sort = table.getByRole("button", { name: "Book" });
    await sort.click();
    await sort.click();
    await sort.click();
    await expect
      .element(table.getByRole("columnheader", { name: "Book" }))
      .not.toHaveAttribute("aria-sort");
    expect(columnText(table, 0)).toStrictEqual(positions.map((row) => row.cusip));
  });

  test("numbers sort by value, not as text", async () => {
    const screen = await renderPositions();
    const table = screen.getByRole("table", { name: "Positions" });
    await table.getByRole("button", { name: "Par" }).click();
    // As text, "10000000.00" would sort before "2000000.00".
    expect(columnText(table, 3)).toStrictEqual([
      "2,000,000",
      "4,000,000",
      "5,000,000",
      "6,000,000",
      "7,500,000",
      "8,000,000",
      "10,000,000",
      "12,000,000",
      "15,000,000",
      "25,000,000",
      "30,000,000",
      "50,000,000",
    ]);
  });

  test("Shift adds a column to the sort, and each heading shows its place in it", async () => {
    const screen = await renderPositions();
    const table = screen.getByRole("table", { name: "Positions" });
    await table.getByRole("button", { name: "Book" }).click();
    await userEvent.click(table.getByRole("button", { name: "Par" }), { modifiers: ["Shift"] });
    await expect
      .element(table.getByRole("columnheader", { name: "Par" }))
      .toHaveAttribute("aria-sort", "ascending");
    expect(columnText(table, 0)).toStrictEqual([
      "91282CRM5",
      "91282CRN3",
      "91282CRQ6",
      "91282CRP8",
      "91282CRL7",
      "91282CRJ2",
      "91282CRK9",
      "91282CRH6",
      "91282CRF0",
      "91282CRT0",
      "91282CRV5",
      "91282CRU7",
    ]);
    // Each heading shows its place in the sort beside its arrow.
    await expect.element(table.getByRole("button", { name: "Book" })).toHaveTextContent("Book1");
    await expect.element(table.getByRole("button", { name: "Par" })).toHaveTextContent("2Par");
  });

  test("missing values sort last whichever way the column sorts", async () => {
    interface Quote {
      readonly id: string;
      readonly spread: number | null;
    }
    const columns: readonly DataTableColumn<Quote>[] = [
      { header: "Bond", id: "id", value: (row) => row.id },
      { header: "Spread", id: "spread", value: (row) => row.spread, variant: "numeric" },
    ];
    const quotes: readonly Quote[] = [
      { id: "A", spread: 42.5 },
      { id: "B", spread: null },
      { id: "C", spread: -3 },
      { id: "D", spread: 120 },
    ];
    const screen = await render(
      <DataTable label="Quotes" columns={columns} data={quotes} getRowId={(row) => row.id} />,
    );
    const table = screen.getByRole("table", { name: "Quotes" });
    const sort = table.getByRole("button", { name: "Spread" });
    await sort.click();
    expect(columnText(table, 0)).toStrictEqual(["C", "A", "D", "B"]);
    await sort.click();
    expect(columnText(table, 0)).toStrictEqual(["D", "A", "C", "B"]);
  });

  test("a numeric column aligns right in tabular figures, its heading too", async () => {
    const screen = await renderPositions();
    const table = screen.getByRole("table", { name: "Positions" });
    const cell = table.getByRole("cell", { name: "25,000,000" });
    expect(getComputedStyle(cell.element()).textAlign).toBe("right");
    expect(getComputedStyle(cell.element()).fontVariantNumeric).toBe("tabular-nums");
    const heading = table.getByRole("columnheader", { name: "Par" });
    expect(getComputedStyle(heading.element()).textAlign).toBe("right");
    const text = table.getByRole("cell", { name: "Rates" }).first();
    expect(getComputedStyle(text.element()).textAlign).not.toBe("right");
  });

  test("a column that does not sort has a plain heading", async () => {
    const screen = await renderPositions();
    const table = screen.getByRole("table", { name: "Positions" });
    await expect.element(table.getByRole("columnheader", { name: "Note" })).toBeVisible();
    await expect.element(table.getByRole("button", { name: "Note" })).not.toBeInTheDocument();
  });
});
