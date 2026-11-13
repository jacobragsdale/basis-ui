/* What FileImport does with a file before anyone sees it: which files it refuses unread, how it decodes their text,
 * and how it maps and checks their rows against a schema. The gallery's tests drive the component in a browser. */

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { decodeText, fileRefusal } from "#components/file-import-file.ts";
import { checkRecords } from "#components/file-import-rows.ts";
import { sentText } from "#components/file-import-sent.ts";
import type { ImportReading } from "#components/file-import-rows.ts";
import { isCusip } from "#securities/index.ts";
import { parseCsv } from "#utils/index.ts";

const megabyte = 1024 * 1024;

const positionRow = z
  .object({
    book: z.enum(["Rates", "Credit"]).optional(),
    cusip: z.string().refine(isCusip, "Not a CUSIP: check its nine characters."),
    par: z.coerce.number().positive("Par must be more than zero."),
    side: z.enum(["buy", "sell"]),
  })
  .refine((row) => row.side === "buy" || row.book !== undefined, {
    message: "A sale needs its book.",
  });

const options = {
  headers: { cusip: "CUSIP", par: ["Par", "Par amount"] },
  maxBytes: megabyte,
  maxRows: 3,
  schema: positionRow,
} as const;

/** The file's rows checked against the position schema. */
function check(text: string): ImportReading<z.output<typeof positionRow>> {
  const reading = parseCsv(text);
  if (!reading.ok) {
    throw new Error(reading.reason);
  }
  return checkRecords("positions.csv", reading.records, options);
}

describe(fileRefusal, () => {
  test("takes an Excel workbook, and refuses Excel's other formats, saying to save them as .xlsx", () => {
    for (const name of ["positions.xlsx", "positions.XLSM", "template.xltx", "template.xltm"]) {
      expect(fileRefusal({ name, size: 100, type: "" }, megabyte)).toBeUndefined();
    }
    expect(fileRefusal({ name: "old.XLS", size: 100, type: "" }, megabyte)).toBe(
      "old.XLS is an Excel 97-2003 workbook (.xls), which this import does not read. Open it in Excel, choose File > Save As, save it as Excel Workbook (.xlsx), and import that file.",
    );
    expect(fileRefusal({ name: "big.xlsb", size: 100, type: "" }, megabyte)).toMatch(
      /^big\.xlsb is an Excel binary workbook \(\.xlsb\)/u,
    );
    expect(fileRefusal({ name: "calc.ods", size: 100, type: "" }, megabyte)).toMatch(
      /^calc\.ods is an OpenDocument spreadsheet \(\.ods\)/u,
    );
  });

  test("refuses a file that is neither CSV nor a workbook", () => {
    expect(fileRefusal({ name: "notes.pdf", size: 100, type: "application/pdf" }, megabyte)).toBe(
      "notes.pdf is not a CSV file or an Excel workbook. Import a file saved as CSV (.csv) or as an Excel Workbook (.xlsx).",
    );
  });

  test("takes a .csv whatever type the browser gives it, as Windows calls it an Excel file", () => {
    expect(
      fileRefusal({ name: "positions.csv", size: 100, type: "application/vnd.ms-excel" }, megabyte),
    ).toBeUndefined();
    expect(fileRefusal({ name: "export", size: 100, type: "text/csv" }, megabyte)).toBeUndefined();
  });

  test("refuses a file over the size limit, stating both sizes", () => {
    expect(
      fileRefusal({ name: "positions.csv", size: 12.3 * megabyte, type: "text/csv" }, 5 * megabyte),
    ).toBe(
      "positions.csv is 12.3 MB, over this import's limit of 5 MB. Split it into smaller files.",
    );
  });
});

describe(decodeText, () => {
  test("reads UTF-8", () => {
    expect(decodeText(new TextEncoder().encode("Société Générale").buffer)).toBe(
      "Société Générale",
    );
  });

  test("falls back to Windows-1252, as Excel's plain CSV is saved", () => {
    // "Société" in Windows-1252: é is the one byte 0xE9, which is not UTF-8.
    const bytes = new Uint8Array([0x53, 0x6f, 0x63, 0x69, 0xe9, 0x74, 0xe9]);
    expect(decodeText(bytes.buffer)).toBe("Société");
  });
});

describe(checkRecords, () => {
  test("maps columns by header, ignoring case, spaces and punctuation, and types the valid rows", () => {
    const reading = check("Side,PAR_AMOUNT,cusip,Desk\r\nbuy,5000000,91282CRF0,Rates desk\r\n");
    expect(reading.ok && reading.check.valid).toStrictEqual([
      { cusip: "91282CRF0", par: 5_000_000, side: "buy" },
    ]);
    expect(reading.ok && reading.check.ignored).toStrictEqual(["Desk"]);
  });

  test("marks each refused cell with its reason, and keeps the rows that pass", () => {
    const reading = check(
      "cusip,par,side,book\r\n91282CRF0,5000000,buy,\r\n91282CRF1,-5,hold,\r\n037833100,250000,sell,\r\n",
    );
    if (!reading.ok) {
      throw new Error(reading.reason);
    }
    const [good, bad, unbooked] = reading.check.rows;
    expect(good?.value).toStrictEqual({ cusip: "91282CRF0", par: 5_000_000, side: "buy" });
    expect(bad?.line).toBe(3);
    expect(bad?.value).toBeUndefined();
    expect(bad?.problems).toStrictEqual({
      cusip: "Not a CUSIP: check its nine characters.",
      par: "Par must be more than zero.",
      side: 'Invalid option: expected one of "buy"|"sell"',
    });
    expect(unbooked?.rowProblem).toBe("A sale needs its book.");
    expect(reading.check.valid).toHaveLength(1);
  });

  test("says an empty required cell is empty", () => {
    const reading = check("cusip,par,side\r\n,5000000,buy\r\n");
    expect(reading.ok && reading.check.rows[0]?.problems).toStrictEqual({
      cusip: "Empty, but this column needs a value.",
    });
  });

  test("refuses a row whose field count differs from the header's", () => {
    const reading = check("cusip,par,side\r\n91282CRF0,5000000\r\n");
    expect(reading.ok && reading.check.rows[0]?.rowProblem).toBe(
      "This line has 2 fields, but the header has 3.",
    );
  });

  test("refuses a file without a column the schema needs, listing the columns it has", () => {
    expect(check("cusip,quantity\r\n91282CRF0,5\r\n")).toStrictEqual({
      ok: false,
      reason: "positions.csv has no Par, side column. Its columns are cusip, quantity.",
    });
  });

  test("refuses a file over the row limit", () => {
    const rows = "91282CRF0,1,buy\r\n".repeat(4);
    expect(check(`cusip,par,side\r\n${rows}`)).toStrictEqual({
      ok: false,
      reason:
        "positions.csv has 4 rows, over this import's limit of 3. Split it into files of 3 rows or fewer.",
    });
  });

  test("refuses a file with no rows under its header", () => {
    expect(check("cusip,par,side\r\n")).toStrictEqual({
      ok: false,
      reason: "positions.csv has no rows under a header row.",
    });
  });
});

describe(sentText, () => {
  test.each([
    ["5M", 5000, "5,000"],
    ["FALSE", true, "true"],
    ["1e3", 1000, "1,000"],
    [" rates ", "RATES", "RATES"],
    ["n/a", undefined, "nothing"],
  ])("says %s is sent as %s", (cell, value, sent) => {
    expect(sentText(cell, value)).toBe(sent);
  });

  test.each([
    ["5,000", 5000],
    ["99.50", 99.5],
    ["-12", -12],
    ["TRUE", true],
    ["false", false],
    ["Rates", "Rates"],
    ["", undefined],
  ])("says nothing for %s, which reads as what is sent", (cell, value) => {
    expect(sentText(cell, value)).toBeUndefined();
  });
});
