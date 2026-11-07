import "#styles.css";

import { DataTable } from "@basis/ui";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { positionColumns } from "./columns.tsx";
import { positions } from "./fixtures.ts";
import type { Position } from "./fixtures.ts";

/** The positions, selectable, eight rows a page. */
async function renderPositions(
  onSelectionChange?: (rows: readonly Position[]) => void,
): Promise<Awaited<ReturnType<typeof render>>> {
  return render(
    <DataTable
      label="Positions"
      columns={positionColumns}
      data={positions}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.cusip}
      selectable
      pageSize={8}
      onSelectionChange={onSelectionChange}
    />,
  );
}

/** The first Blob saved through `URL.createObjectURL`: its first three bytes, and its text after them. */
async function savedText(
  calls: readonly (readonly [Blob | MediaSource])[],
): Promise<{ readonly start: Uint8Array; readonly text: string }> {
  const [[blob] = []] = calls;
  const bytes = new Uint8Array(blob instanceof Blob ? await blob.arrayBuffer() : []);
  return { start: bytes.slice(0, 3), text: new TextDecoder().decode(bytes.slice(3)) };
}

/** Hides a column through the columns menu, and closes the menu. */
async function hideColumn(name: string): Promise<void> {
  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("menuitemcheckbox", { name }).click();
  await userEvent.keyboard("{Escape}");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DataTable selection", () => {
  test("a row's checkbox selects the row, and the heading's shows that some are", async () => {
    const screen = await renderPositions();
    const row = screen.getByRole("checkbox", { name: "Select 91282CRT0" });
    await row.click();
    await expect.element(row).toBeChecked();
    await expect.element(screen.getByText("1 of 12 selected")).toBeVisible();
    await expect
      .element(screen.getByRole("checkbox", { name: "Select all rows" }))
      .toHaveAttribute("aria-checked", "mixed");
    const selected = row.element().closest("tr");
    expect(selected?.dataset["state"]).toBe("selected");
  });

  test("the heading's checkbox selects every row, on every page, and clears them", async () => {
    const screen = await renderPositions();
    const all = screen.getByRole("checkbox", { name: "Select all rows" });
    await all.click();
    await expect.element(screen.getByText("12 of 12 selected")).toBeVisible();
    await expect.element(all).toBeChecked();
    await all.click();
    await expect.element(screen.getByText("0 of 12 selected")).toBeVisible();
  });

  test("the heading's checkbox selects only the rows the filter shows", async () => {
    const screen = await renderPositions();
    const filter = screen.getByRole("searchbox", { name: "Filter Positions" });
    await filter.fill("Agency");
    await screen.getByRole("checkbox", { name: "Select all rows" }).click();
    await expect.element(screen.getByText("4 of 4 selected")).toBeVisible();
    await filter.fill("");
    await expect.element(screen.getByText("4 of 12 selected")).toBeVisible();
  });

  test("Shift with a click selects the rows from the last one chosen", async () => {
    const screen = await renderPositions();
    await screen.getByRole("checkbox", { name: "Select 91282CRV5" }).click();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select 91282CRF0" }), {
      modifiers: ["Shift"],
    });
    await expect.element(screen.getByText("4 of 12 selected")).toBeVisible();
    await expect.element(screen.getByRole("checkbox", { name: "Select 91282CRU7" })).toBeChecked();
  });

  test("tells the app which rows are selected", async () => {
    const changes: (readonly string[])[] = [];
    const screen = await renderPositions((rows) => {
      changes.push(rows.map((row) => row.cusip));
    });
    await screen.getByRole("checkbox", { name: "Select 91282CRU7" }).click();
    await screen.getByRole("checkbox", { name: "Select 91282CRV5" }).click();
    expect(changes).toStrictEqual([["91282CRU7"], ["91282CRV5", "91282CRU7"]]);
  });
});

describe("DataTable copy and export", () => {
  test("Copy puts the selected rows on the clipboard as TSV, a formula written as text", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const screen = await renderPositions();
    const copy = screen.getByRole("button", { name: "Copy" });
    await expect.element(copy).toBeDisabled();
    await screen.getByRole("checkbox", { name: "Select 91282CRF0" }).click();
    await screen.getByRole("checkbox", { name: "Select 91282CRT0" }).click();
    await copy.click();
    await expect.poll(() => writeText.mock.calls.length).toBe(1);
    expect(writeText.mock.calls[0]?.[0]).toBe(
      [
        "CUSIP\tSecurity\tBook\tPar\tPrice\tChange\tSettled\tNote\r\n",
        "91282CRT0\tUST 4.750% 10/31/2031\tRates\t10000000.00\t99.96875\t-0.0625\tTRUE\tOn repo\r\n",
        `91282CRF0\tUST 4.625% 08/15/2036\tRates\t5000000.00\t99.515625\t-0.25\tTRUE\t"'=HYPERLINK(""https://example.com"",""Allocation"")"\r\n`,
      ].join(""),
    );
  });

  test("Export CSV saves the file under the table's name, marked as UTF-8", async () => {
    const saved = vi.spyOn(URL, "createObjectURL");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockReturnValue();
    const screen = await renderPositions();
    await screen.getByRole("button", { name: "Export CSV" }).click();
    const { start } = await savedText(saved.mock.calls);
    // A byte order mark, so Excel reads the file as UTF-8.
    expect(start).toStrictEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
    const [link] = click.mock.contexts;
    expect(link instanceof HTMLAnchorElement ? link.download : "").toBe("Positions.csv");
  });

  test("Export CSV saves the rows the filter shows, with the columns showing", async () => {
    const saved = vi.spyOn(URL, "createObjectURL");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockReturnValue();
    const screen = await renderPositions();
    await hideColumn("Security");
    await screen.getByRole("searchbox", { name: "Filter Positions" }).fill("Rates");
    await screen.getByRole("button", { name: "Export CSV" }).click();
    const { text } = await savedText(saved.mock.calls);
    expect(text).toBe(
      [
        "CUSIP,Book,Par,Price,Change,Settled,Note\r\n",
        "91282CRV5,Rates,25000000.00,100.40625,0.125,TRUE,\r\n",
        "91282CRT0,Rates,10000000.00,99.96875,-0.0625,TRUE,On repo\r\n",
        "91282CRU7,Rates,50000000.00,100.015625,0.03125,FALSE,\r\n",
        `91282CRF0,Rates,5000000.00,99.515625,-0.25,TRUE,"'=HYPERLINK(""https://example.com"",""Allocation"")"\r\n`,
      ].join(""),
    );
  });
});
