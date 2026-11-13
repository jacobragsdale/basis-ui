/* Reading CSV text, as RFC 4180 writes it and Excel saves it: fields separated by commas, records by CRLF (or a lone
 * LF or CR, as other tools write them), and a field that holds a comma, a double quote or a line break wrapped in
 * double quotes, with its own double quotes doubled. A byte order mark at the start is dropped, since Excel's "CSV
 * UTF-8" writes one.
 *
 * It reads strictly, and says where it stopped: a quoted field that never closes, text after a closing quote, and a
 * double quote inside an unquoted field are each an error naming the line, rather than a guess that would shift the
 * columns of every record after it. */

/** One record: its fields as text, and the line of the file it starts on, counting from 1. */
interface CsvRecord {
  readonly line: number;
  readonly fields: readonly string[];
}

/** A file's records, or why it is not CSV and the line where reading stopped. */
type CsvReading =
  | { readonly ok: true; readonly records: readonly CsvRecord[] }
  | { readonly ok: false; readonly line: number; readonly reason: string };

/** Where reading is: the text, the position in it, and the line that position is on. */
interface Cursor {
  readonly text: string;
  position: number;
  line: number;
}

type Step<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly reason: string };

const byteOrderMark = "﻿";
const plainField = /[^\r\n,"]*/uy;
const lineBreak = /\r\n|\n|\r/uy;
const lineBreaks = /\r\n|\n|\r/gu;
/** What may follow a field: a comma, a line break, or the end of the text. */
const fieldEnd = /,|\r|\n|$/uy;

/** Matches `pattern` at the cursor, and moves the cursor past the match. */
function take(pattern: RegExp, cursor: Cursor): RegExpExecArray | null {
  pattern.lastIndex = cursor.position;
  const found = pattern.exec(cursor.text);
  if (found !== null) {
    cursor.position = pattern.lastIndex;
  }
  return found;
}

/** Whether a field ends at the cursor, without moving it. */
function atFieldEnd(cursor: Cursor): boolean {
  fieldEnd.lastIndex = cursor.position;
  return fieldEnd.test(cursor.text);
}

/** The text of the quoted field that opens at `start`, its doubled quotes as they are written, and where its closing
 * quote is; `undefined` when it never closes. A scan from quote to quote, so a field cut short is found at once: a
 * pattern such as `"(?:[^"]+|"")*"` backtracks exponentially when the closing quote is missing. */
function quotedAt(
  text: string,
  start: number,
): { readonly raw: string; readonly close: number } | undefined {
  let from = start + 1;
  for (;;) {
    const quote = text.indexOf('"', from);
    if (quote === -1) {
      return undefined;
    }
    if (text.charAt(quote + 1) !== '"') {
      return { close: quote, raw: text.slice(start + 1, quote) };
    }
    from = quote + 2;
  }
}

/** A field wrapped in double quotes, whose doubled quotes stand for one, and whose line breaks are part of it. */
function readQuoted(cursor: Cursor): Step<string> {
  const opened = cursor.line;
  const found = quotedAt(cursor.text, cursor.position);
  if (found === undefined) {
    return {
      ok: false,
      reason: `Line ${String(opened)} opens a quoted field that never closes: add its closing double quote.`,
    };
  }
  cursor.position = found.close + 1;
  const text = found.raw;
  cursor.line += text.match(lineBreaks)?.length ?? 0;
  if (!atFieldEnd(cursor)) {
    return {
      ok: false,
      reason: `Line ${String(cursor.line)} has text after a quoted field's closing quote: quote the whole field, and double each double quote inside it.`,
    };
  }
  return { ok: true, value: text.replaceAll('""', '"') };
}

/** A field without quotes, which runs to the next comma or line break. */
function readPlain(cursor: Cursor): Step<string> {
  const text = take(plainField, cursor)?.[0] ?? "";
  if (!atFieldEnd(cursor)) {
    return {
      ok: false,
      reason: `Line ${String(cursor.line)} has a double quote inside a field without quotes: quote the whole field, and double each double quote inside it.`,
    };
  }
  return { ok: true, value: text };
}

/** The fields of one record, up to its line break or the end of the text. */
function readRecord(cursor: Cursor): Step<string[]> {
  const fields: string[] = [];
  let more = true;
  while (more) {
    const field =
      cursor.text.charAt(cursor.position) === '"' ? readQuoted(cursor) : readPlain(cursor);
    if (!field.ok) {
      return field;
    }
    fields.push(field.value);
    more = take(/,/uy, cursor) !== null;
  }
  return { ok: true, value: fields };
}

/** A record whose every field is empty, as a blank line or Excel's `,,,` for an empty row is. */
function isBlank(fields: readonly string[]): boolean {
  return fields.every((field) => field === "");
}

/** Reads the record at the cursor and the line break after it, adding the record to `records` unless it is blank;
 * returns why it cannot be read, if it cannot. */
function readInto(records: CsvRecord[], cursor: Cursor): string | undefined {
  const { line } = cursor;
  const record = readRecord(cursor);
  if (!record.ok) {
    return record.reason;
  }
  if (!isBlank(record.value)) {
    records.push({ fields: record.value, line });
  }
  if (take(lineBreak, cursor) !== null) {
    cursor.line += 1;
  }
  return undefined;
}

/** Reads CSV text into its records, leaving out blank ones, or says why it cannot:
 *
 *   const reading = parseCsv(await file.text());
 *   if (reading.ok) {
 *     const [header, ...rows] = reading.records;
 *   } else {
 *     show(reading.reason); // Line 7 opens a quoted field that never closes: ...
 *   }
 *
 * Fields are text, exactly as written; a record may hold more or fewer fields than another, which the caller checks
 * against its header. */
function parseCsv(text: string): CsvReading {
  const cursor: Cursor = { line: 1, position: text.startsWith(byteOrderMark) ? 1 : 0, text };
  const records: CsvRecord[] = [];
  while (cursor.position < text.length) {
    const problem = readInto(records, cursor);
    if (problem !== undefined) {
      return { line: cursor.line, ok: false, reason: problem };
    }
  }
  return { ok: true, records };
}

export { parseCsv };
export type { CsvReading, CsvRecord };
