/* FileImport's reading of an Excel workbook: which sheet it takes, which it offers instead, and how a sheet's rows are
 * checked, by the row numbers Excel shows. The gallery's tests drive the component in a browser. */

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { readImport } from "#components/file-import-read.ts";
import type { FileReading } from "#components/file-import-read.ts";
import { zipBytes } from "#testing/zip-file.ts";
import { workbookFile } from "#testing/workbook-file.ts";

const megabyte = 1024 * 1024;

const positionRow = z.object({
  cusip: z.string().length(9, "A CUSIP has nine characters."),
  par: z.coerce.number().positive("Par must be more than zero."),
  settles: z.iso.date().optional(),
  note: z.string().optional(),
});

const options = {
  headers: { cusip: "CUSIP", par: "Par", settles: "Settles" },
  maxBytes: megabyte,
  maxRows: 10,
  schema: positionRow,
} as const;

type Reading = FileReading<z.output<typeof positionRow>>;

/** The reading's check, failing the test when the file is refused. */
function checked(reading: Reading): Extract<Reading, { readonly ok: true }> {
  if (!reading.ok) {
    throw new Error(reading.reason);
  }
  return reading;
}

const october = [
  ["CUSIP", "Par", "Settles"],
  ["037833100", 1_000_000, Temporal.PlainDate.from("2026-10-02")],
];
const november = [
  ["Positions as of November"],
  [],
  ["CUSIP", "Par", "Settles"],
  ["91282CRF0", 250_000, Temporal.PlainDate.from("2026-11-09")],
];

describe(readImport, () => {
  test("takes the first visible sheet that holds the schema's columns, and offers the others that do", async () => {
    const file = await workbookFile(
      {
        Lists: [["CUSIP", "Par"]],
        Notes: [["Read me"]],
        October: october,
        November: [october[0] ?? [], ...november.slice(3)],
      },
      { hidden: ["Lists"], name: "positions.xlsx" },
    );
    const reading = checked(await readImport(file, options));
    expect(reading.check).toMatchObject({
      fileName: "positions.xlsx",
      sheet: "October",
      sheets: ["October", "November"],
      valid: [{ cusip: "037833100", par: 1_000_000, settles: "2026-10-02" }],
    });
    expect(reading.checkOf("November")).toMatchObject({
      sheet: "November",
      sheets: ["October", "November"],
      valid: [{ cusip: "91282CRF0", par: 250_000, settles: "2026-11-09" }],
    });
  });

  test("takes the sheet the app names, hidden or not, ignoring case", async () => {
    const file = await workbookFile(
      { October: october, Archive: october },
      { hidden: ["Archive"] },
    );
    const reading = checked(await readImport(file, { ...options, sheet: "archive" }));
    expect([reading.check.sheet, reading.check.sheets]).toStrictEqual(["Archive", ["Archive"]]);
    expect(await readImport(file, { ...options, sheet: "December" })).toStrictEqual({
      ok: false,
      reason: "workbook.xlsx has no sheet named December. Its sheets are October, Archive.",
    });
  });

  test("finds the header under a report's title, and numbers the rows as Excel does", async () => {
    const reading = checked(await readImport(await workbookFile({ November: november }), options));
    expect(reading.check.rows.map((row) => [row.line, row.value])).toStrictEqual([
      [4, { cusip: "91282CRF0", par: 250_000, settles: "2026-11-09" }],
    ]);
  });

  test("says why no sheet can be imported, sheet by sheet", async () => {
    const file = await workbookFile({
      Prices: [
        ["CUSIP", "Price"],
        ["91282CRF0", 99.5],
      ],
      Notes: [["Read me"]],
    });
    expect(await readImport(file, options)).toStrictEqual({
      ok: false,
      reason:
        "None of the sheets in workbook.xlsx can be imported. Sheet Prices of workbook.xlsx has no Par column. Its columns are CUSIP, Price. Sheet Notes of workbook.xlsx has no rows under a header row.",
    });
    const one = await workbookFile({ Notes: [["Read me"], ["Line"]] });
    expect(await readImport(one, options)).toStrictEqual({
      ok: false,
      reason: "Sheet Notes of workbook.xlsx has no CUSIP, Par column. Its columns are Read me.",
    });
  });

  test("refuses a row whose cell holds an Excel error, whatever the schema takes", async () => {
    const sheet = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>CUSIP</t></is></c><c r="B1" t="inlineStr"><is><t>Par</t></is></c><c r="C1" t="inlineStr"><is><t>Note</t></is></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>037833100</t></is></c><c r="B4"><v>5000</v></c><c r="C4" t="e"><v>#N/A</v></c></row></sheetData></worksheet>`;
    const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const bytes = await zipBytes({
      "xl/_rels/workbook.xml.rels": {
        text: `<Relationships><Relationship Id="a" Type="${relationships}/worksheet" Target="sheet.xml"/></Relationships>`,
      },
      "xl/sheet.xml": { text: sheet },
      "xl/workbook.xml": {
        text: `<workbook><sheets><sheet name="Data" r:id="a"/></sheets></workbook>`,
      },
    });
    const reading = checked(await readImport(new File([bytes], "errors.xlsx"), options));
    expect(reading.check.rows).toStrictEqual([
      {
        cells: { cusip: "037833100", note: "#N/A", par: "5000", settles: "" },
        line: 4,
        problems: { note: "Excel's #N/A error, not a value." },
        rowProblem: undefined,
        value: undefined,
      },
    ]);
  });

  test("refuses a workbook the reader cannot read, saying to save it as .xlsx", async () => {
    const file = new File(
      [Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
      "locked.xlsx",
    );
    expect(await readImport(file, options)).toStrictEqual({
      ok: false,
      reason:
        "locked.xlsx could not be read as an Excel workbook. It is protected with a password, or it is an Excel 97-2003 workbook (.xls) under another name. Open it in Excel, choose File > Save As, save it as Excel Workbook (.xlsx), and import that file.",
    });
  });
});
