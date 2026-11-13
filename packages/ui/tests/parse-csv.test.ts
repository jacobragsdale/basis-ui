import { describe, expect, test } from "vite-plus/test";

import { parseCsv, toCsv } from "#utils/index.ts";
import type { CsvReading } from "#utils/index.ts";

/** The records' fields, failing the test when the text is refused. */
function fieldsOf(reading: CsvReading): (readonly string[])[] {
  if (!reading.ok) {
    throw new Error(reading.reason);
  }
  return reading.records.map((record) => record.fields);
}

describe(parseCsv, () => {
  test("reads records separated by CRLF, with the line each starts on", () => {
    const reading = parseCsv("cusip,par\r\n91282CRF0,5000000\r\n037833100,250000\r\n");
    expect(reading).toStrictEqual({
      ok: true,
      records: [
        { fields: ["cusip", "par"], line: 1 },
        { fields: ["91282CRF0", "5000000"], line: 2 },
        { fields: ["037833100", "250000"], line: 3 },
      ],
    });
  });

  test("takes LF and CR line breaks, and a last record without one", () => {
    expect(fieldsOf(parseCsv("a,b\nc,d\re,f"))).toStrictEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
  });

  test("reads quoted fields: commas, doubled quotes and line breaks inside them", () => {
    const reading = parseCsv(
      'issuer,note\r\n"Placeholder ""Co"", Inc.","line one\r\nline two"\r\nnext,row\r\n',
    );
    expect(fieldsOf(reading)).toStrictEqual([
      ["issuer", "note"],
      ['Placeholder "Co", Inc.', "line one\r\nline two"],
      ["next", "row"],
    ]);
    // The record after a quoted line break starts a line later.
    expect(reading.ok && reading.records[2]?.line).toBe(4);
  });

  test("keeps empty fields, and an empty quoted field", () => {
    expect(fieldsOf(parseCsv('a,,"",d\r\n'))).toStrictEqual([["a", "", "", "d"]]);
  });

  test("leaves out blank lines and rows of empty fields, as Excel writes an empty row", () => {
    const reading = parseCsv("a,b\r\n\r\n,\r\nc,d\r\n");
    expect(reading.ok && reading.records.map((record) => record.line)).toStrictEqual([1, 4]);
  });

  test("drops a byte order mark at the start", () => {
    expect(fieldsOf(parseCsv("﻿cusip,par\r\n"))).toStrictEqual([["cusip", "par"]]);
  });

  test("reads back what toCsv writes", () => {
    const rows = [
      { issuer: 'Placeholder "Co", Inc.', note: "=SUM(A1:A9)" },
      { issuer: "Example Water Authority", note: "line one\nline two" },
    ];
    const csv = toCsv(rows, [
      { header: "Issuer", value: (row): string => row.issuer },
      { header: "Note", value: (row): string => row.note },
    ]);
    expect(fieldsOf(parseCsv(csv))).toStrictEqual([
      ["Issuer", "Note"],
      ['Placeholder "Co", Inc.', "'=SUM(A1:A9)"],
      ["Example Water Authority", "line one\nline two"],
    ]);
  });
});

describe("parseCsv's refusals", () => {
  test("refuses a quoted field that never closes, naming the line it opens on", () => {
    expect(parseCsv('a,b\r\nc,"open\r\nstill open')).toStrictEqual({
      line: 2,
      ok: false,
      reason: "Line 2 opens a quoted field that never closes: add its closing double quote.",
    });
  });

  /* A file a user drops must never freeze the tab: a quoted field cut short is refused at once, however long it runs,
   * where a backtracking pattern took a second at 28 characters and doubled with each. */
  test.each([
    ["an unclosed quote of 100,000 characters", `a,b\n1,"${"x".repeat(100_000)}`],
    ["a truncated record", 'cusip,name\n037833100,"APPLE INC 3.85 05/04/43\n'],
    ["an unclosed quote among doubled quotes", `a\n"${'x""'.repeat(30_000)}`],
  ])("refuses %s at once", (_name, text) => {
    const started = performance.now();
    const reading = parseCsv(text);
    expect(performance.now() - started).toBeLessThan(100);
    expect(!reading.ok && reading.reason).toBe(
      "Line 2 opens a quoted field that never closes: add its closing double quote.",
    );
  });

  test("reads a quoted field of 100,000 characters, its doubled quotes and line breaks among them", () => {
    const long = `${'x""\r\n'.repeat(20_000)}end`;
    expect(fieldsOf(parseCsv(`a,b\n"${long}",2\nc,3`))).toStrictEqual([
      ["a", "b"],
      [long.replaceAll('""', '"'), "2"],
      ["c", "3"],
    ]);
  });

  test("refuses text after a closing quote", () => {
    const reading = parseCsv('a,b\r\n"quoted"tail,c\r\n');
    expect(reading.ok).toBe(false);
    expect(!reading.ok && reading.reason).toBe(
      "Line 2 has text after a quoted field's closing quote: quote the whole field, and double each double quote inside it.",
    );
  });

  test("refuses a double quote inside a field without quotes", () => {
    const reading = parseCsv('size\r\n5" pipe\r\n');
    expect(!reading.ok && [reading.line, reading.reason]).toStrictEqual([
      2,
      "Line 2 has a double quote inside a field without quotes: quote the whole field, and double each double quote inside it.",
    ]);
  });

  test("reads an empty text as no records", () => {
    expect(parseCsv("")).toStrictEqual({ ok: true, records: [] });
  });
});
