/* What a grid's status bar says: the rows shown, the date the data is for, or else when the source was read and how
 * long ago, NaNs the load turned blank, a failed refresh, and the details of the table's load. Times are New York's. */

import type { TableStatus } from "#proto/parallax_pb.ts";

const time = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: "America/New_York",
  year: "numeric",
});
const grouped = new Intl.NumberFormat("en-US");
const microsPerMilli = 1000n;
/** A time of zero means the source gave none. */
const noTime = 0n;
const secondsPerMinute = 60;
const minutesPerHour = 60;
const hoursPerDay = 24;
/** Ages under two days are told in hours. */
const hoursShown = 48;
const msPerSecond = 1000;

/** Formats microseconds since the epoch as `YYYY-MM-DD HH:MM:SS` in New York. */
function statusTime(micros: bigint): string {
  const at = new Date(Number(micros / microsPerMilli));
  const parts = new Map(time.formatToParts(at).map((part) => [part.type, part.value]));
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.get(type) ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

/** Describes an age in whole units, such as `4 min ago`. */
function ageText(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / msPerSecond));
  if (seconds < secondsPerMinute) {
    return "just now";
  }
  const minutes = Math.floor(seconds / secondsPerMinute);
  if (minutes < minutesPerHour) {
    return `${String(minutes)} min ago`;
  }
  const hours = Math.floor(minutes / minutesPerHour);
  return hours < hoursShown
    ? `${String(hours)} h ago`
    : `${String(Math.floor(hours / hoursPerDay))} days ago`;
}

/** The rows shown, or that they are loading. */
function rowsText(rows: number | null): string {
  return rows === null ? "loading…" : `${grouped.format(rows)} rows`;
}

/** A badge's text and the explanation it shows on hover. */
interface Note {
  readonly text: string;
  readonly title: string;
}

/** When the source was read, as the bar and About this data tell it. */
interface AsOf {
  readonly time: string;
  readonly ms: number;
}

/** When the source was read, or null when it gave no time. Never the time the table loaded: data days old would read
 * as current. About this data lists that time apart, as Loaded at. */
function asOfOf(sourceAsOf: bigint | null): AsOf | null {
  // Zero means the source gave no time.
  return sourceAsOf === null || sourceAsOf === noTime
    ? null
    : { ms: Number(sourceAsOf / microsPerMilli), time: statusTime(sourceAsOf) };
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/u;
const asOfFix =
  'pass the date the data is for as YYYY-MM-DD, such as "2026-11-06", or leave asOf out.';

/** The `asOf` a page gives a grid, checked: its date, null for none, or why it is not a date, as an `ERROR` line that
 * ends with the fix. */
type DateCheck =
  | { readonly ok: true; readonly date: string | null }
  | { readonly ok: false; readonly reason: string };

/** Checks the `asOf` a page gives a grid: a date in the calendar as `YYYY-MM-DD`, or none. */
function asOfDate(value?: string): DateCheck {
  if (value === undefined) {
    return { date: null, ok: true };
  }
  if (!isoDate.test(value)) {
    return { ok: false, reason: `ERROR asOf "${value}" is not a YYYY-MM-DD date: ${asOfFix}` };
  }
  // A day past its month's end rolls into the next month, so a date that reads back differently is none.
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const at = new Date(0);
  at.setUTCFullYear(year, month - 1, day);
  return at.toISOString().startsWith(value)
    ? { date: value, ok: true }
    : { ok: false, reason: `ERROR asOf "${value}" is no day of the calendar: ${asOfFix}` };
}

/** What the bar says of when the data is from, and the explanation it shows on hover: the page's date alone, or else
 * the source's time and its age at `nowMs`; null when there is neither. */
function asOfText(date: string | null, read: AsOf | null, nowMs: number): Note | null {
  const readAt = (at: AsOf): string => `Source read at ${at.time} New York time`;
  if (date !== null) {
    const forDate = `The data is for ${date}`;
    return {
      text: `as of ${date}`,
      title: read === null ? forDate : `${forDate}. ${readAt(read)}`,
    };
  }
  return read === null
    ? null
    : { text: `as of ${read.time} · ${ageText(nowMs - read.ms)}`, title: readAt(read) };
}

/** The NaNs the load turned blank, by column, or null for none. */
function nansOf(status: TableStatus | null): Note | null {
  const columns = status?.nansToNull ?? [];
  const total = columns.reduce((sum, column) => sum + column.count, noTime);
  if (total === noTime) {
    return null;
  }
  const detail = columns
    .map((column) => `${column.column}: ${grouped.format(column.count)}`)
    .join(", ");
  return {
    text: `${grouped.format(total)} NaN shown blank`,
    title: `NaN values became blanks when the data loaded. ${detail}`,
  };
}

/** A refresh that failed, or null. */
function failedOf(status: TableStatus | null): Note | null {
  if (status === null || status.refreshError === "") {
    return null;
  }
  const at =
    status.refreshFailedAtMicros === noTime
      ? ""
      : ` at ${statusTime(status.refreshFailedAtMicros)}`;
  return {
    text: `refresh failed${at}`,
    title: `${status.refreshError}. The grid still shows the last good load.`,
  };
}

/** The details About this data lists. */
function detailsOf({
  dataset,
  rows,
  asOf,
  status,
}: {
  readonly dataset: string;
  readonly rows: string;
  readonly asOf: AsOf | null;
  readonly status: TableStatus | null;
}): readonly { readonly term: string; readonly value: string }[] {
  const loadedAt =
    status === null || status.loadedAtMicros === noTime
      ? "unknown"
      : `${statusTime(status.loadedAtMicros)} New York`;
  const items = [
    { term: "Dataset", value: dataset },
    { term: "Rows in view", value: rows },
    { term: "Rows in table", value: status === null ? "unknown" : grouped.format(status.rows) },
    { term: "Load", value: status === null ? "unknown" : `#${status.loadVersion.toString()}` },
    { term: "Loaded at", value: loadedAt },
    { term: "Source read at", value: asOf?.time ?? "unknown" },
  ];
  return status === null || status.refreshError === ""
    ? items
    : [...items, { term: "Last refresh", value: status.refreshError }];
}

export { ageText, asOfDate, asOfOf, asOfText, detailsOf, failedOf, nansOf, rowsText, statusTime };
export type { AsOf, DateCheck };
