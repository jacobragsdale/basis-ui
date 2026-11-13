/* The workbook reader on files from anywhere: every failure is `{ ok: false }` with a reason, never a thrown
 * exception, and what it holds is bounded by what the sheet holds, not by its widest address. */

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";

import { zipBytes } from "#testing/zip-file.ts";
import { readWorkbook } from "#utils/index.ts";
import type { SheetReading } from "#utils/index.ts";
import { numericCellText } from "#utils/workbook-cells.ts";

import { main, officeRelationships, packageRelationships, rawWorkbook } from "./workbook-fakes.ts";

const fixture = new Uint8Array(
  readFileSync(new URL("fixtures/workbooks/openpyxl-positions.xlsx", import.meta.url)),
);

/** Park and Miller's minimal standard generator, seeded, so a failure reproduces: its products stay exact in a double. */
function generator(seed: number): () => number {
  const modulus = 2_147_483_647;
  let state = seed % modulus;
  return () => {
    state = (state * 48_271) % modulus;
    return state / modulus;
  };
}

/** The fixture with one to four of its bytes set at random. */
function flipped(random: () => number): Uint8Array {
  const bytes = Uint8Array.from(fixture);
  const flips = 1 + Math.floor(random() * 4);
  for (let flip = 0; flip < flips; flip += 1) {
    bytes[Math.floor(random() * bytes.length)] = Math.floor(random() * 256);
  }
  return bytes;
}

/** Every sheet of the workbook `bytes` holds, read, or the reason it is refused. */
async function readAll(bytes: Uint8Array): Promise<readonly string[]> {
  const reading = await readWorkbook(bytes);
  if (!reading.ok) {
    return [reading.reason];
  }
  const sheets = await Promise.all(
    reading.workbook.sheets.map(async ({ name }) => reading.workbook.readSheet(name)),
  );
  return sheets.map((sheet) => (sheet.ok ? "ok" : sheet.reason));
}

/** The sheet One of a raw workbook. */
async function sheetOne(bytes: Uint8Array): Promise<SheetReading> {
  const reading = await readWorkbook(bytes);
  if (!reading.ok) {
    throw new Error(reading.reason);
  }
  return reading.workbook.readSheet("One");
}

describe("a damaged workbook", () => {
  test("flipping random bytes of a real workbook never throws, and each reading ends at once", async () => {
    const random = generator(20_261_113);
    let slowest = 0;
    for (let run = 0; run < 3000; run += 1) {
      const bytes = flipped(random);
      const started = performance.now();
      // oxlint-disable-next-line no-await-in-loop -- one reading at a time, so each is timed alone.
      const read = await readAll(bytes);
      slowest = Math.max(slowest, performance.now() - started);
      expect(Array.isArray(read)).toBe(true);
    }
    expect(slowest).toBeLessThan(1000);
  }, 120_000);

  test("an entry whose extra field claims 65,535 bytes is refused, not thrown", async () => {
    const bytes = await rawWorkbook(`<worksheet xmlns="${main}"><sheetData/></worksheet>`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const directory = view.getUint32(bytes.byteLength - 6, true);
    view.setUint16(directory + 30, 0xff_ff, true);
    const reading = await readWorkbook(bytes);
    expect(reading.ok).toBe(false);
  });

  test("a relationship whose target is not percent-encoded as a URI's must be reads by its name as written", async () => {
    const bytes = await zipBytes({
      "_rels/.rels": {
        text: `<Relationships xmlns="${packageRelationships}"><Relationship Id="r1" Type="${officeRelationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      },
      "xl/_rels/workbook.xml.rels": {
        text: `<Relationships xmlns="${packageRelationships}"><Relationship Id="s1" Type="${officeRelationships}/worksheet" Target="worksheets/100%.xml"/></Relationships>`,
      },
      "xl/workbook.xml": {
        text: `<workbook xmlns="${main}" xmlns:r="${officeRelationships}"><sheets><sheet name="One" sheetId="1" r:id="s1"/></sheets></workbook>`,
      },
      "xl/worksheets/100%.xml": {
        text: `<worksheet xmlns="${main}"><sheetData><row r="1"><c r="A1"><v>7</v></c></row></sheetData></worksheet>`,
      },
    });
    expect(await sheetOne(bytes)).toStrictEqual({
      ok: true,
      records: [{ fields: ["7"], line: 1 }],
    });
  });
});

describe("a sheet that names cells far apart", () => {
  test("400 rows of one cell each at column XFD are refused with a reason, not padded to 6.5 million fields", async () => {
    const rows = Array.from(
      { length: 400 },
      (_unused, index) =>
        `<row r="${String(index + 1)}"><c r="XFD${String(index + 1)}"><v>1</v></c></row>`,
    ).join("");
    const reading = await sheetOne(
      await rawWorkbook(`<worksheet xmlns="${main}"><sheetData>${rows}</sheetData></worksheet>`),
    );
    expect(reading.ok).toBe(false);
    expect(!reading.ok && reading.reason).toMatch(
      /^Its sheet One could not be read\. Row \d+ has a cell at XFD\d+, far past the cells the sheet holds: delete the empty columns between them in Excel, save it, and import it again\.$/u,
    );
  });

  test("a sheet with a note far to the right of a few columns still reads", async () => {
    const reading = await sheetOne(
      await rawWorkbook(
        `<worksheet xmlns="${main}"><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c><c r="CV1"><v>3</v></c></row><row r="2"><c r="A2"><v>4</v></c></row></sheetData></worksheet>`,
      ),
    );
    expect(reading.ok && reading.records.map(({ fields }) => fields.length)).toStrictEqual([
      100, 1,
    ]);
  });
});

describe("a date past Excel's last day", () => {
  test.each([
    ["2958465", false, "9999-12-31"],
    ["2957003", true, "9999-12-31"],
  ])("serial %s (1904 system: %s) is %s, Excel's last day", (serial, date1904, text) => {
    expect(numericCellText(serial, "date", date1904)).toStrictEqual({ ok: true, text });
  });

  test.each([
    ["2958466", false],
    ["2957004", true],
    ["20261109", false],
    ["250000000", false],
  ])(
    "serial %s (1904 system: %s) is a problem of its cell, as Excel shows #####",
    (serial, date1904) => {
      expect(numericCellText(serial, "date", date1904)).toStrictEqual({
        ok: false,
        reason:
          "A date past 31 December 9999, which Excel cannot show: the cell holds a number formatted as a date.",
      });
    },
  );
});

describe("attributes and values", () => {
  test("a sheet whose name holds what looks like another attribute reads its own relationship's part", async () => {
    const bytes = await zipBytes({
      "_rels/.rels": {
        text: `<Relationships xmlns="${packageRelationships}"><Relationship Id="r1" Type="${officeRelationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      },
      "xl/_rels/workbook.xml.rels": {
        text: `<Relationships xmlns="${packageRelationships}"><Relationship Id="s1" Type="${officeRelationships}/worksheet" Target="worksheets/one.xml"/><Relationship Id="s2" Type="${officeRelationships}/worksheet" Target="worksheets/two.xml"/></Relationships>`,
      },
      "xl/workbook.xml": {
        text: `<workbook xmlns="${main}" xmlns:r="${officeRelationships}"><sheets><sheet name="P&amp;L id='s2' x" sheetId="1" r:id="s1"/><sheet name="Two" sheetId="2" r:id="s2"/></sheets></workbook>`,
      },
      "xl/worksheets/one.xml": {
        text: `<worksheet xmlns="${main}"><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>`,
      },
      "xl/worksheets/two.xml": {
        text: `<worksheet xmlns="${main}"><sheetData><row r="1"><c r="A1"><v>2</v></c></row></sheetData></worksheet>`,
      },
    });
    const reading = await readWorkbook(bytes);
    const sheet = reading.ok ? await reading.workbook.readSheet("P&L id='s2' x") : undefined;
    expect(sheet).toStrictEqual({ ok: true, records: [{ fields: ["1"], line: 1 }] });
  });

  test("a shared string cell with an empty value is a problem, not the first string", async () => {
    const reading = await sheetOne(
      await rawWorkbook(
        `<worksheet xmlns="${main}"><sheetData><row r="1"><c r="A1" t="s"><v></v></c></row></sheetData></worksheet>`,
        { "xl/strings.xml": { text: `<sst xmlns="${main}"><si><t>first</t></si></sst>` } },
      ),
    );
    expect(reading).toStrictEqual({
      ok: true,
      records: [
        {
          fields: [""],
          line: 1,
          problems: new Map([[0, "The workbook lacks the shared string this cell refers to."]]),
        },
      ],
    });
  });
});
