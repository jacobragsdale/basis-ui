/* Reading Excel workbooks: one openpyxl wrote, ones `workbookFile` writes, and archives of hand-written parts for what
 * other writers do (namespace prefixes, inline strings, cells without references, strict Open XML, the 1904 date
 * system) and for what the reader refuses. */

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";

import { zipBytes } from "#testing/zip-file.ts";
import { workbookFile } from "#testing/workbook-file.ts";
import { readWorkbook } from "#utils/index.ts";
import type { SheetRecord, Workbook } from "#utils/index.ts";

import { main, officeRelationships, packageRelationships, rawWorkbook } from "./workbook-fakes.ts";

/** The workbook, failing the test when it is refused. */
async function open(bytes: Uint8Array | ArrayBuffer): Promise<Workbook> {
  const reading = await readWorkbook(bytes);
  if (!reading.ok) {
    throw new Error(reading.reason);
  }
  return reading.workbook;
}

/** A sheet's records, failing the test when it is refused. */
async function records(workbook: Workbook, sheet: string): Promise<readonly SheetRecord[]> {
  const reading = await workbook.readSheet(sheet);
  if (!reading.ok) {
    throw new Error(reading.reason);
  }
  return reading.records;
}

/** Where the sheet's central directory entry, the fourth of rawWorkbook's, starts: past three entries of 46 bytes
 * and their name, extra field and comment, whose lengths are at 28, 30 and 32. */
function sheetEntry(view: DataView): number {
  let entry = view.getUint32(view.byteLength - 6, true);
  for (let index = 0; index < 3; index += 1) {
    const lengths = view.getUint16(entry + 28, true) + view.getUint16(entry + 30, true);
    entry += 46 + lengths + view.getUint16(entry + 32, true);
  }
  return entry;
}

describe(readWorkbook, () => {
  test("reads a workbook openpyxl wrote: its sheets, hidden ones marked, and its cells as Excel shows them", async () => {
    const bytes = readFileSync(
      new URL("fixtures/workbooks/openpyxl-positions.xlsx", import.meta.url),
    );
    const workbook = await open(new Uint8Array(bytes));
    expect(workbook.sheets).toStrictEqual([
      { hidden: true, name: "Lists", worksheet: true },
      { hidden: false, name: "Positions", worksheet: true },
      { hidden: false, name: "Notes", worksheet: true },
    ]);
    expect(await records(workbook, "Positions")).toStrictEqual([
      { fields: ["CUSIP", "Par", "Price", "Coupon", "Settles", "Callable", "Book"], line: 1 },
      {
        fields: ["037833100", "1000000", "90.966", "0.0425", "2026-11-09", "TRUE", "Rates"],
        line: 2,
      },
      // Row 3 is blank and left out; the row after keeps its number, and its empty last cell is left off.
      { fields: ["91282CRF0", "250000", "0.3", "0.05", "2026-11-10T09:30:00", "FALSE"], line: 4 },
    ]);
  });

  test("reads the workbooks workbookFile writes, with shared strings and dates", async () => {
    const file = await workbookFile(
      {
        Positions: [
          ["CUSIP", "Par", "Settles", "Callable"],
          ["037833100", 1_000_000, Temporal.PlainDate.from("2026-11-09"), true],
          [null, undefined, "", false],
        ],
        Hidden: [["x"]],
      },
      { hidden: ["Hidden"], name: "positions.xlsx" },
    );
    expect(file.name).toBe("positions.xlsx");
    const workbook = await open(await file.arrayBuffer());
    expect(workbook.sheets.map((sheet) => [sheet.name, sheet.hidden])).toStrictEqual([
      ["Positions", false],
      ["Hidden", true],
    ]);
    expect(await records(workbook, "Positions")).toStrictEqual([
      { fields: ["CUSIP", "Par", "Settles", "Callable"], line: 1 },
      { fields: ["037833100", "1000000", "2026-11-09", "TRUE"], line: 2 },
      { fields: ["", "", "", "FALSE"], line: 3 },
    ]);
  });

  test("reads prefixed tags, inline and rich strings, cells without references, entities and CDATA", async () => {
    const sheet = `<x:worksheet xmlns:x="${main}"><x:sheetData>
      <x:row><x:c t="inlineStr"><x:is><x:t>A &amp; B</x:t></x:is></x:c><x:c t="s"><x:v>0</x:v></x:c></x:row>
      <x:row><x:c t="inlineStr"><x:is><x:t><![CDATA[<raw> & text]]></x:t></x:is></x:c><x:c t="s"><x:v>1</x:v></x:c></x:row>
      <!-- a comment <x:row> -->
      <x:row r="7"><x:c r="C7" t="str"><x:f>A1&amp;"!"</x:f><x:v>A &amp; B!</x:v></x:c></x:row>
    </x:sheetData></x:worksheet>`;
    const strings = `<sst xmlns="${main}"><si><r><t>Rich </t></r><r><rPr><b/></rPr><t xml:space="preserve">text</t></r><rPh><t>ignored</t></rPh></si><si><t>line_x000D_break &#x41;</t></si></sst>`;
    const workbook = await open(await rawWorkbook(sheet, { "xl/strings.xml": { text: strings } }));
    expect(await records(workbook, "One")).toStrictEqual([
      { fields: ["A & B", "Rich text"], line: 1 },
      { fields: ["<raw> & text", "line\rbreak A"], line: 2 },
      { fields: ["", "", "A & B!"], line: 7 },
    ]);
  });

  test("reads numbers by their formats: dates, times, elapsed times, percents and the 1904 date system", async () => {
    const styles = `<styleSheet xmlns="${main}"><numFmts>
      <numFmt numFmtId="164" formatCode="h:mm AM/PM"/><numFmt numFmtId="165" formatCode="[h]:mm"/>
      <numFmt numFmtId="166" formatCode="&quot;Day &quot;0"/><numFmt numFmtId="167" formatCode="[$-409]mmm\\-yy;@"/>
    </numFmts><cellStyleXfs><xf numFmtId="14"/></cellStyleXfs><cellXfs>
      <xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="22"/><xf numFmtId="164"/><xf numFmtId="165"/>
      <xf numFmtId="166"/><xf numFmtId="167"/><xf numFmtId="10"/>
    </cellXfs></styleSheet>`;
    const cells = ["46335", "46336.395833333336", "0.75", "1.5", "7", "46335", "0.0525"].map(
      (value, index) => `<c s="${String(index + 1)}"><v>${value}</v></c>`,
    );
    const sheet = `<worksheet xmlns="${main}"><sheetData><row>${cells.join("")}</row><row><c s="1"><v>59</v></c><c s="1"><v>61</v></c><c s="1"><v>60</v></c><c s="1"><v>-1</v></c></row></sheetData></worksheet>`;
    const parts = { "xl/styles.xml": { text: styles } };
    const workbook = await open(await rawWorkbook(sheet, parts));
    expect(await records(workbook, "One")).toStrictEqual([
      {
        // A date reads as ISO 8601 whatever its format shows, here mmm-yy for the sixth.
        fields: [
          "2026-11-09",
          "2026-11-10T09:30:00",
          "18:00:00",
          "1.5",
          "7",
          "2026-11-09",
          "0.0525",
        ],
        line: 1,
      },
      {
        fields: ["1900-02-28", "1900-03-01", "60", "-1"],
        line: 2,
        problems: new Map([
          [2, "29 February 1900, a day Excel counts that never was."],
          [3, "A negative date, which Excel cannot show."],
        ]),
      },
    ]);
    const in1904 = await rawWorkbook(sheet, {
      ...parts,
      "xl/workbook.xml": {
        text: `<workbook xmlns="${main}" xmlns:r="${officeRelationships}"><workbookPr date1904="1"/><sheets><sheet name="One" sheetId="1" r:id="s1"/></sheets></workbook>`,
      },
    });
    const [first] = await records(await open(in1904), "One");
    expect(first?.fields[0]).toBe("2030-11-10");
  });

  test("marks Excel's errors and formulas Excel never calculated", async () => {
    const sheet = `<worksheet xmlns="${main}"><sheetData><row r="2"><c r="A2" t="e"><f>1/0</f><v>#DIV/0!</v></c><c r="B2"><f>SUM(A1:A9)</f></c><c r="C2" t="b"><v>0</v></c></row></sheetData></worksheet>`;
    const workbook = await open(await rawWorkbook(sheet));
    expect(await records(workbook, "One")).toStrictEqual([
      {
        fields: ["#DIV/0!", "", "FALSE"],
        line: 2,
        problems: new Map([
          [0, "Excel's #DIV/0! error, not a value."],
          [
            1,
            "A formula Excel has not calculated: open the file in Excel, save it, and import it again.",
          ],
        ]),
      },
    ]);
  });

  test("reads strict Open XML, whose relationship types and dates differ", async () => {
    const strict = "http://purl.oclc.org/ooxml/officeDocument/relationships";
    const bytes = await zipBytes({
      "_rels/.rels": {
        text: `<Relationships xmlns="${packageRelationships}"><Relationship Id="r1" Type="${strict}/officeDocument" Target="xl/book.xml"/></Relationships>`,
      },
      "xl/_rels/book.xml.rels": {
        text: `<Relationships xmlns="${packageRelationships}"><Relationship Id="a" Type="${strict}/worksheet" Target="sheets/a.xml"/><Relationship Id="c" Type="${strict}/chartsheet" Target="sheets/c.xml"/></Relationships>`,
      },
      "xl/book.xml": {
        text: `<workbook><sheets><sheet name="Data" r:id="a"/><sheet name="Chart" r:id="c"/></sheets></workbook>`,
      },
      "xl/sheets/a.xml": {
        text: `<worksheet><sheetData><row r="1"><c r="A1" t="d"><v>2026-11-09T00:00:00Z</v></c><c r="B1" t="d"><v>2026-11-09T09:30:00</v></c></row></sheetData></worksheet>`,
      },
    });
    const workbook = await open(bytes);
    expect(workbook.sheets).toStrictEqual([
      { hidden: false, name: "Data", worksheet: true },
      { hidden: false, name: "Chart", worksheet: false },
    ]);
    expect(await records(workbook, "Data")).toStrictEqual([
      { fields: ["2026-11-09", "2026-11-09T09:30:00"], line: 1 },
    ]);
    expect(await workbook.readSheet("Chart")).toStrictEqual({
      ok: false,
      reason: "Its sheet Chart is a chart or macro sheet, which holds no cells.",
    });
    expect(await workbook.readSheet("Missing")).toStrictEqual({
      ok: false,
      reason: "It has no sheet named Missing.",
    });
  });

  test("refuses what is not a workbook it reads, saying what it is", async () => {
    const ole = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(await readWorkbook(ole)).toStrictEqual({
      ok: false,
      reason:
        "It is protected with a password, or it is an Excel 97-2003 workbook (.xls) under another name.",
    });
    expect(await readWorkbook(new TextEncoder().encode("﻿ <html><table>"))).toStrictEqual({
      ok: false,
      reason:
        "It is a web page or an XML file under a workbook's name, as some systems export them.",
    });
    expect(await readWorkbook(new TextEncoder().encode("not a workbook"))).toStrictEqual({
      ok: false,
      reason: "It is damaged, or it is another kind of file under a workbook's name.",
    });
    const zip = await zipBytes({ "notes.txt": { text: "hello" } });
    expect(await readWorkbook(zip.subarray(0, zip.byteLength - 4))).toStrictEqual({
      ok: false,
      reason: "It is damaged: its ZIP directory is missing or cut short.",
    });
    expect(await readWorkbook(zip)).toStrictEqual({
      ok: false,
      reason: "It is a ZIP archive, but not an Excel workbook: it has no workbook part.",
    });
  });

  test("refuses a sheet that unzips past the limit", async () => {
    const big = `<worksheet><sheetData>${"<row/>".repeat(10_000)}</sheetData></worksheet>`;
    const reading = await readWorkbook(await rawWorkbook(big), { maxPartBytes: 50_000 });
    if (!reading.ok) {
      throw new Error(reading.reason);
    }
    expect(await reading.workbook.readSheet("One")).toStrictEqual({
      ok: false,
      reason:
        "Its sheet One could not be read. xl/worksheets/one.xml unzips to more than 50000 bytes.",
    });
  });

  test("refuses an encrypted part, and one compressed by a method a browser lacks", async () => {
    const bytes = await rawWorkbook(`<worksheet><sheetData/></worksheet>`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sheet = sheetEntry(view);
    view.setUint16(sheet + 8, 1, true);
    const encrypted = await open(bytes);
    expect(await encrypted.readSheet("One")).toStrictEqual({
      ok: false,
      reason: "Its sheet One could not be read. xl/worksheets/one.xml is encrypted.",
    });
    view.setUint16(sheet + 8, 0, true);
    // Method 12 is bzip2.
    view.setUint16(sheet + 10, 12, true);
    const bzipped = await open(bytes);
    expect(await bzipped.readSheet("One")).toStrictEqual({
      ok: false,
      reason:
        "Its sheet One could not be read. xl/worksheets/one.xml is compressed with method 12, which a browser cannot unzip.",
    });
  });
});
