import "#styles.css";

import { DataTable } from "@basis/ui";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { manyPositions, positionColumns, unavailable } from "./columns.tsx";
import { DataTableSection } from "./data-table.tsx";
import { positions } from "./fixtures.ts";
import { columnText, inCompactDensity } from "./test-helpers.ts";

/** The positions, under a cap of the test's. */
function Capped({ rowCap }: { readonly rowCap: number }): ReactElement {
  return (
    <DataTable
      label="Positions"
      columns={positionColumns}
      data={positions}
      getRowId={(row) => row.id}
      rowCap={rowCap}
    />
  );
}

describe("DataTable's row cap", () => {
  test("past the cap it draws no table, and one error sends the data to parallax's Grid", async () => {
    const screen = await render(
      <DataTable
        label="All positions"
        columns={positionColumns}
        data={manyPositions}
        getRowId={(row) => row.id}
      />,
    );
    const alert = screen.getByRole("alert", { name: "Too many rows for this table" });
    await expect
      .element(alert.getByText("All positions has 2,001 rows, past DataTable's cap of 2,000."))
      .toBeVisible();
    await expect
      .element(alert.getByText(/^Show data this size in parallax's <Grid>, from @basis\/parallax/u))
      .toBeVisible();
    await expect.element(page.getByRole("table")).not.toBeInTheDocument();
    await expect.element(page.getByRole("searchbox")).not.toBeInTheDocument();
  });

  test("a table sets its own cap, and draws its rows up to it", async () => {
    const screen = await render(<Capped rowCap={11} />);
    await expect.element(screen.getByText(/12 rows, past DataTable's cap of 11/u)).toBeVisible();
    await screen.rerender(<Capped rowCap={12} />);
    await expect.element(screen.getByRole("table", { name: "Positions" })).toBeVisible();
    expect(columnText(screen.getByRole("table"), 0)).toHaveLength(12);
  });
});

describe("DataTable's states", () => {
  test("loading, it marks the table busy and shows placeholder rows", async () => {
    const screen = await render(
      <DataTable
        label="Positions"
        columns={positionColumns}
        data={undefined}
        getRowId={(row) => row.id}
        loading
      />,
    );
    const table = screen.getByRole("table", { name: "Positions" });
    await expect.element(table).toHaveAttribute("aria-busy", "true");
    expect(table.element().querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  test("empty, it says so, in the app's words", async () => {
    const screen = await render(
      <DataTable
        label="Positions"
        columns={positionColumns}
        data={[]}
        getRowId={(row) => row.id}
        empty="The credit book holds nothing today."
      />,
    );
    await expect.element(screen.getByText("No rows to show.")).toBeVisible();
    await expect.element(screen.getByText("The credit book holds nothing today.")).toBeVisible();
  });

  test("failed with no rows, it shows the error alone, with Try again", async () => {
    let retried = 0;
    const screen = await render(
      <DataTable
        label="Positions"
        columns={positionColumns}
        data={undefined}
        getRowId={(row) => row.id}
        error={unavailable}
        onRetry={() => {
          retried += 1;
        }}
      />,
    );
    const alert = screen.getByRole("alert", { name: "Positions are unavailable" });
    await expect
      .element(alert.getByText("The positions service did not answer in time."))
      .toBeVisible();
    await expect.element(page.getByRole("table")).not.toBeInTheDocument();
    await alert.getByRole("button", { name: "Try again" }).click();
    expect(retried).toBe(1);
  });

  test("filtered to nothing, it says what matched nothing and offers to clear the filter", async () => {
    const screen = await render(
      <DataTable
        label="Positions"
        columns={positionColumns}
        data={positions}
        getRowId={(row) => row.id}
      />,
    );
    const filter = screen.getByRole("searchbox", { name: "Filter Positions" });
    await filter.fill("zzz");
    await expect.element(screen.getByText('No rows match "zzz".')).toBeVisible();
    await screen.getByRole("button", { name: "Clear the filter" }).click();
    await expect.element(filter).toHaveValue("");
    await expect.poll(() => columnText(screen.getByRole("table"), 0)).toHaveLength(12);
  });
});

describe("DataTable's filter, columns, pages and actions", () => {
  test("the filter keeps the rows with its text in a column, ignoring case", async () => {
    const screen = await render(
      <DataTable
        label="Positions"
        columns={positionColumns}
        data={positions}
        getRowId={(row) => row.id}
      />,
    );
    await screen.getByRole("searchbox", { name: "Filter Positions" }).fill("hedge");
    // The table filters once typing pauses.
    await expect
      .poll(() => columnText(screen.getByRole("table"), 0))
      .toStrictEqual(["91282CRM5", "91282CRJ2"]);
  });

  test("the columns menu hides a column, but not the last one showing", async () => {
    const two = positionColumns.filter((column) => column.id === "cusip" || column.id === "book");
    const screen = await render(
      <DataTable label="Positions" columns={two} data={positions} getRowId={(row) => row.id} />,
    );
    await screen.getByRole("button", { name: "Columns" }).click();
    // The CUSIP column says it cannot be hidden, so only Book is offered.
    await expect
      .element(page.getByRole("menuitemcheckbox", { name: "CUSIP" }))
      .toHaveAttribute("aria-disabled", "true");
    await page.getByRole("menuitemcheckbox", { name: "Book" }).click();
    await expect
      .element(screen.getByRole("columnheader", { name: "Book" }))
      .not.toBeInTheDocument();
  });

  test("pages through the rows, a button disabled at each end", async () => {
    const screen = await render(<DataTableSection />);
    const previous = screen.getByRole("button", { name: "Previous page" });
    const next = screen.getByRole("button", { name: "Next page" });
    await expect.element(screen.getByText("Rows 1–8 of 12")).toBeVisible();
    await expect.element(previous).toBeDisabled();
    await next.click();
    await expect.element(screen.getByText("Rows 9–12 of 12")).toBeVisible();
    await expect.element(screen.getByText("Page 2 of 2")).toBeVisible();
    await expect.element(next).toBeDisabled();
  });

  test("a row's actions menu, named after the row, runs an action", async () => {
    const screen = await render(<DataTableSection />);
    await screen.getByRole("button", { name: "Actions for 91282CRF0 in Rates" }).click();
    await page.getByRole("menuitem", { name: "Allocate" }).click();
    await expect.element(screen.getByText("Allocated 91282CRF0.")).toBeVisible();
    await screen.getByRole("button", { name: "Actions for 91282CRU7 in Rates" }).click();
    await expect
      .element(page.getByRole("menuitem", { name: "Close position" }))
      .toHaveAttribute("aria-disabled", "true");
  });

  test("its checkboxes and buttons stay at least 24 px across in the compact density", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<DataTableSection />);
      const controls = [
        ...screen.getByRole("checkbox").all(),
        screen.getByRole("button", { name: "Actions for 91282CRF0 in Rates" }),
        screen.getByRole("button", { name: "Next page" }),
      ];
      for (const control of controls) {
        const box = control.element().getBoundingClientRect();
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
      }
    });
  });
});
