import "#styles.css";

import { FileImport } from "@basis/ui";
import { workbookFile } from "@basis/ui/testing";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { FileImportSection } from "./file-import.tsx";
import { positionImportHeaders, positionImportRow } from "./import-schema.ts";
import type { ImportedPosition } from "./import-schema.ts";

const goodFile = [
  "CUSIP,Book,Par amount,Price,Note",
  "91282CRF0,Rates,5000M,99.515625,",
  "91282CRT0,Agency,250M,100.5,Hedge",
  "91282CRU7,Credit,1.5mm,100,",
].join("\r\n");

const badFile = [
  "CUSIP,Book,Par,Price,Desk",
  "91282CRF0,Rates,5000M,99.515625,East",
  "91282CRF1,Desk,abc,99-16,West",
  ",Rates,,100,East",
].join("\r\n");

function csvFile(text: string, name = "positions.csv"): File {
  return new File([text], name, { type: "text/csv" });
}

/** A positions import with the test's limits, whose imports land in `received`. */
function PositionsImport({
  received,
  maxBytes,
  maxRows,
}: {
  readonly received: (readonly ImportedPosition[])[];
  readonly maxBytes?: number;
  readonly maxRows?: number;
}): ReactElement {
  return (
    <FileImport
      schema={positionImportRow}
      headers={positionImportHeaders}
      maxBytes={maxBytes}
      maxRows={maxRows}
      onImport={(rows) => {
        received.push(rows);
      }}
    />
  );
}

/** Chooses `file` through the drop zone's file input. */
async function choose(file: File): Promise<void> {
  await userEvent.upload(page.getByLabelText("CSV or Excel file"), file);
}

describe("FileImport with a good file", () => {
  test("states its limits before a file is chosen", async () => {
    const screen = await render(<PositionsImport received={[]} />);
    await expect
      .element(
        screen.getByText(
          "A CSV file or an Excel workbook (.xlsx) with a header row, up to 5 MB and 10,000 rows.",
        ),
      )
      .toBeVisible();
  });

  test("previews the rows, mapped by their headers, then hands over the rows typed", async () => {
    const received: (readonly ImportedPosition[])[] = [];
    const screen = await render(<PositionsImport received={received} />);
    await choose(csvFile(goodFile));
    await expect
      .element(screen.getByText("positions.csv: 3 rows, 3 ready to import, 0 with problems."))
      .toBeVisible();
    await expect
      .element(screen.getByRole("table", { name: "Rows in positions.csv" }))
      .toBeVisible();
    await screen.getByRole("button", { name: "Import 3 rows" }).click();
    await expect
      .element(screen.getByRole("status", { name: "Imported 3 rows from positions.csv." }))
      .toBeVisible();
    expect(received).toStrictEqual([
      [
        { book: "Rates", cusip: "91282CRF0", par: 5_000_000, price: 99.515625 },
        { book: "Agency", cusip: "91282CRT0", note: "Hedge", par: 250_000, price: 100.5 },
        { book: "Credit", cusip: "91282CRU7", par: 1_500_000, price: 100 },
      ],
    ]);
  });

  test("takes a file dropped on the drop zone", async () => {
    const screen = await render(<PositionsImport received={[]} />);
    const zone = document.querySelector('[data-slot="file-import-drop"]');
    const transfer = new DataTransfer();
    transfer.items.add(csvFile(goodFile));
    zone?.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
    await expect.element(screen.getByRole("button", { name: "Import 3 rows" })).toBeVisible();
  });

  test("hands the app's error back, and keeps the preview", async () => {
    const screen = await render(
      <FileImport
        schema={positionImportRow}
        headers={positionImportHeaders}
        onImport={async () => Promise.reject(new TypeError("Failed to fetch"))}
      />,
    );
    await choose(csvFile(goodFile));
    await screen.getByRole("button", { name: "Import 3 rows" }).click();
    await expect.element(screen.getByRole("alert")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Import 3 rows" })).toBeEnabled();
  });
});

describe("FileImport with a bad file", () => {
  test("marks each refused cell with its reason, on its line", async () => {
    const screen = await render(<PositionsImport received={[]} />);
    await choose(csvFile(badFile));
    await expect
      .element(
        screen.getByText(
          "positions.csv: 3 rows, 1 ready to import, 2 with problems. Columns not imported: Desk.",
        ),
      )
      .toBeVisible();
    const line = screen
      .getByRole("table", { name: "Rows in positions.csv" })
      .getByRole("row", { name: /^3 /u });
    const reasons = [
      "Not a CUSIP: check its nine characters and its check digit.",
      "Use a book: Rates, Agency or Credit.",
      '"abc" has no digits.',
      "Write the price as a decimal, such as 99.515625.",
    ];
    await Promise.all(
      reasons.map(async (reason) =>
        expect.element(line.getByText(reason, { exact: false })).toBeVisible(),
      ),
    );
  });

  test("says which required cells are empty", async () => {
    const screen = await render(<PositionsImport received={[]} />);
    await choose(csvFile(badFile));
    const line = screen
      .getByRole("table", { name: "Rows in positions.csv" })
      .getByRole("row", { name: /^4 /u });
    await expect.element(line).toBeVisible();
    expect(
      line.getByText("Empty, but this column needs a value.", { exact: false }).all(),
    ).toHaveLength(2);
  });

  test("imports only the valid rows, and can show just the rows with problems", async () => {
    const received: (readonly ImportedPosition[])[] = [];
    const screen = await render(<PositionsImport received={received} />);
    await choose(csvFile(badFile));
    await screen.getByRole("switch", { name: "Only rows with problems" }).click();
    await expect.element(screen.getByText("Rows 1–2 of 2")).toBeVisible();
    await screen.getByRole("button", { name: "Import 1 row" }).click();
    expect(received.flat().map((row) => row.cusip)).toStrictEqual(["91282CRF0"]);
  });

  test("refuses a file without a column the schema needs", async () => {
    const screen = await render(<PositionsImport received={[]} />);
    await choose(csvFile("CUSIP,Book\r\n91282CRF0,Rates\r\n"));
    await expect
      .element(
        screen.getByText("positions.csv has no Par, Price column. Its columns are CUSIP, Book."),
      )
      .toBeVisible();
  });

  test("refuses CSV it cannot read, naming the line", async () => {
    const screen = await render(<PositionsImport received={[]} />);
    await choose(csvFile('CUSIP,Book,Par,Price\r\n91282CRF0,"Rates,5000M,99\r\n'));
    await expect
      .element(screen.getByText(/^positions\.csv is not valid CSV\. Line 2 opens a quoted field/u))
      .toBeVisible();
  });
});

/** A workbook of positions by month: a notes sheet, then a sheet for October and one for November, which has a title
 * row above its header. */
async function monthlyWorkbook(): Promise<File> {
  const header = ["CUSIP", "Book", "Par amount", "Price"];
  return workbookFile(
    {
      Notes: [["Positions by month"]],
      October: [header, ["91282CRF0", "Rates", 5_000_000, 99.515625]],
      November: [["As of 2026-11-07"], header, ["91282CRT0", "Agency", 250_000, 100.5]],
    },
    { name: "positions.xlsx" },
  );
}

describe("FileImport with an Excel workbook", () => {
  test("previews the first sheet with the columns, by Excel's row numbers, and switches to another", async () => {
    const received: (readonly ImportedPosition[])[] = [];
    const screen = await render(<PositionsImport received={received} />);
    await choose(await monthlyWorkbook());
    await expect
      .element(
        screen.getByText(
          "positions.xlsx, sheet October: 1 row, 1 ready to import, 0 with problems.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("columnheader", { name: "Row" })).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText("Sheet"), "November");
    await expect
      .element(
        screen.getByText(
          "positions.xlsx, sheet November: 1 row, 1 ready to import, 0 with problems.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("cell", { name: "3", exact: true })).toBeVisible();
    await screen.getByRole("button", { name: "Import 1 row" }).click();
    expect(received).toStrictEqual([
      [{ book: "Agency", cusip: "91282CRT0", par: 250_000, price: 100.5 }],
    ]);
  });
});

describe("FileImport's refusals", () => {
  test("refuses an Excel 97-2003 workbook, saying to save it as .xlsx", async () => {
    const screen = await render(<PositionsImport received={[]} />);
    await choose(new File(["ÐÏ"], "positions.xls", { type: "application/vnd.ms-excel" }));
    const alert = screen.getByRole("alert", { name: "The file was not imported" });
    await expect
      .element(
        alert.getByText(
          "positions.xls is an Excel 97-2003 workbook (.xls), which this import does not read. Open it in Excel, choose File > Save As, save it as Excel Workbook (.xlsx), and import that file.",
        ),
      )
      .toBeVisible();
  });

  test("refuses a damaged workbook, saying why", async () => {
    const screen = await render(<PositionsImport received={[]} />);
    await choose(new File(["PK"], "positions.xlsx"));
    const alert = screen.getByRole("alert", { name: "The file was not imported" });
    await expect
      .element(
        alert.getByText(
          "positions.xlsx could not be read as an Excel workbook. It is damaged: its ZIP directory is missing or cut short. Open it in Excel, choose File > Save As, save it as Excel Workbook (.xlsx), and import that file.",
        ),
      )
      .toBeVisible();
  });

  test("refuses a file over its size limit, before reading it", async () => {
    const screen = await render(<PositionsImport received={[]} maxBytes={1024} />);
    await choose(csvFile(`${goodFile}\r\n${"91282CRF0,Rates,5000M,99.5,\r\n".repeat(60)}`));
    await expect
      .element(screen.getByText(/^positions\.csv is 1\.\d KB, over this import's limit of 1 KB\./u))
      .toBeVisible();
  });

  test("refuses a file with more rows than its limit", async () => {
    const screen = await render(<PositionsImport received={[]} maxRows={2} />);
    await expect.element(screen.getByText(/up to 5 MB and 2 rows\./u)).toBeVisible();
    await choose(csvFile(goodFile));
    await expect
      .element(
        screen.getByText(
          "positions.csv has 3 rows, over this import's limit of 2. Split it into files of 2 rows or fewer.",
        ),
      )
      .toBeVisible();
  });

  test("refuses two files dropped at once", async () => {
    const screen = await render(<FileImportSection />);
    const transfer = new DataTransfer();
    transfer.items.add(csvFile(goodFile, "a.csv"));
    transfer.items.add(csvFile(goodFile, "b.csv"));
    document
      .querySelector('[data-slot="file-import-drop"]')
      ?.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
    await expect
      .element(screen.getByText("2 files were dropped. Drop one file at a time."))
      .toBeVisible();
  });
});
