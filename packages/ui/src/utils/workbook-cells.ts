/* What an Excel cell's stored number reads as, as text: the text a schema reads, which is what Excel shows rather
 * than what it stores where the two differ in a way the user did not mean, and nothing a display format adds.
 *
 * - A number is its 15 significant digits, as Excel shows it, so a computed 0.30000000000000004 reads as 0.3; and it
 *   is written out in full, never as 1e-7. A display format's thousands separators, currency or percent sign are left
 *   out: a cell showing 5.00% reads as 0.05.
 * - A number whose format shows a date or a time reads as ISO 8601: `2026-01-02`, `2026-01-02T09:30:00` or
 *   `09:30:00`, by the parts its format shows, in the workbook's date system (1900, with Excel's 29 February 1900,
 *   or 1904). An elapsed time, such as `[h]:mm`, is a number of days. */

/** The text of a numeric cell, or why it has none. */
type CellText =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: string };

/** What a cell's number format shows: a plain number, or a date, a time, or both. */
type NumberKind = "number" | "date" | "time" | "dateTime";

/** Excel's built-in number formats that show dates or times, by their ids: the ones every locale has (14 to 22 and
 * 45 to 47), and the East Asian ones (27 to 36 and 50 to 58). 46 is `[h]:mm:ss`, an elapsed time, so a number. */
const builtInDates = "14 15 16 17 27 28 29 30 31 34 35 36 50 51 52 53 54 57 58";
const builtInTimes = "18 19 20 21 32 33 45 47 55 56";
const builtInDateTime = 22;
const builtInKinds: ReadonlyMap<number, NumberKind> = new Map([
  ...builtInDates.split(" ").map((id) => [Number(id), "date"] as const),
  ...builtInTimes.split(" ").map((id) => [Number(id), "time"] as const),
  [builtInDateTime, "dateTime"],
]);
const millisecondsPerDay = 86_400_000;
/** Serial 60 is 29 February 1900, which Excel keeps for Lotus 1-2-3's sake, though that day never was. */
const leapBugSerial = 60;
const significantDigits = 15;

// A format's literal text and its padding, which name no part of a date: "text", \x, _x and *x.
const formatLiterals = /"[^"]*"|\\.|_.|\*./gu;
const elapsed = /\[(?:h+|m+|s+)\]/iu;
// Its colour, condition and locale, in brackets, and `General`, whose letters name no part of a date.
const formatNoise = /\[[^\]]*\]|general/giu;
const dateParts = /[dy]|e(?![+-])|g|b/iu;
const timeParts = /[hs]|am\/pm|a\/p/iu;
const exponentForm = /^(?<sign>-?)(?<whole>\d)(?:\.(?<fraction>\d+))?e(?<exponent>[+-]\d+)$/u;

/** What a number format, by its code, shows. */
function codeKind(code: string): NumberKind {
  // The first section formats positive numbers; the others, negatives and zero, show the same parts.
  const [section = ""] = code.replaceAll(formatLiterals, "").split(";");
  if (elapsed.test(section)) {
    return "number";
  }
  const parts = section.replaceAll(formatNoise, "");
  const time = timeParts.test(parts);
  // `m` is a month beside a date's parts or alone, and a minute beside an hour or a second.
  const date = dateParts.test(parts) || (!time && /m/iu.test(parts));
  if (date) {
    return time ? "dateTime" : "date";
  }
  return time ? "time" : "number";
}

/** What a number format shows, by its id and, for a custom one, its code. */
function numberKind(id: number, code?: string): NumberKind {
  return code === undefined ? (builtInKinds.get(id) ?? "number") : codeKind(code);
}

/** A decimal written by `String` with an exponent, written out in full. */
function withoutExponent(text: string): string {
  const groups = exponentForm.exec(text)?.groups;
  if (groups === undefined) {
    return text;
  }
  const { sign = "", whole = "", fraction = "", exponent = "0" } = groups;
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  if (point <= 0) {
    return `${sign}0.${"0".repeat(-point)}${digits}`;
  }
  return point >= digits.length
    ? `${sign}${digits}${"0".repeat(point - digits.length)}`
    : `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** A number as Excel shows it in General: its 15 significant digits, without trailing zeros or an exponent. */
function numberText(value: number, stored: string): string {
  // Stored text of 15 characters or fewer has no more digits than Excel shows, and String gives them back.
  if (stored.length <= significantDigits && !/e/iu.test(stored)) {
    return withoutExponent(String(value));
  }
  // toPrecision rounds the double's exact value, and a decimal of 15 digits survives the trip back through a double.
  const shown = Number(value.toPrecision(significantDigits));
  return withoutExponent(String(shown));
}

/** Time of day, from milliseconds since midnight: `09:30:00`, or `09:30:00.25` to the millisecond. */
function timeText(milliseconds: number): string {
  const time = Temporal.PlainTime.from("00:00").add({ milliseconds });
  return time.toString({ smallestUnit: time.millisecond === 0 ? "second" : "millisecond" });
}

/** A day's ISO date in a date system, memoized, since a sheet's dates repeat and Temporal is slow to start. */
const dates = new Map<string, string>();
function dayText(days: number, date1904: boolean): string {
  const key = `${String(days)}${date1904 ? "+" : ""}`;
  let text = dates.get(key);
  if (text === undefined) {
    // Day 1 is 1 January 1900, and every day from 1 March 1900 is one later for the day Excel adds before it.
    const leap = days < leapBugSerial ? "1899-12-31" : "1899-12-30";
    text = Temporal.PlainDate.from(date1904 ? "1904-01-01" : leap)
      .add({ days })
      .toString();
    dates.set(key, text);
  }
  return text;
}

/** Why a date serial shows no date: before Excel's first day, or on the day it counts that never was. */
function dateRefusal(serial: number, days: number, date1904: boolean): string | undefined {
  if (serial < 0) {
    return "A negative date, which Excel cannot show.";
  }
  return !date1904 && days === leapBugSerial
    ? "29 February 1900, a day Excel counts that never was."
    : undefined;
}

/** A date serial's text, by the parts its format shows. */
function dateText(
  serial: number,
  kind: Exclude<NumberKind, "number">,
  date1904: boolean,
): CellText {
  const total = Math.round(serial * millisecondsPerDay);
  const days = Math.floor(total / millisecondsPerDay);
  const time = (): string => timeText(total - days * millisecondsPerDay);
  if (kind === "time") {
    return { ok: true, text: time() };
  }
  const refusal = dateRefusal(serial, days, date1904);
  if (refusal !== undefined) {
    return { ok: false, reason: refusal };
  }
  const date = dayText(days, date1904);
  return { ok: true, text: kind === "date" ? date : `${date}T${time()}` };
}

/** A numeric cell's text, as `<v>` stores it, by what its format shows. */
function numericCellText(stored: string, kind: NumberKind, date1904: boolean): CellText {
  const value = Number(stored);
  if (stored.trim() === "" || !Number.isFinite(value)) {
    return { ok: false, reason: `Excel stored ${stored} as this cell's number, which is not one.` };
  }
  return kind === "number"
    ? { ok: true, text: numberText(value, stored) }
    : dateText(value, kind, date1904);
}

/** A date cell, which Strict Open XML stores as ISO 8601 text, without the midnight time a date-only one gets. */
function isoCellText(stored: string): string {
  return stored.replace(/T00:00(?::00(?:\.0+)?)?Z?$/u, "");
}

export { isoCellText, numberKind, numberText, numericCellText };
export type { CellText, NumberKind };
