/* What a grid's status bar says: the rows shown, when the source was read and how long ago, NaNs the load turned
 * blank, a failed refresh, and the details of the table's load. Times are New York's. */

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

/** When the source was read: its own time, or failing that when the table loaded; null without either. */
interface AsOf {
  readonly time: string;
  readonly ms: number;
}

function asOfOf(sourceAsOf: bigint | null, status: TableStatus | null): AsOf | null {
  // Zero means the source gave no time; fall back to when the table loaded.
  const micros =
    sourceAsOf !== null && sourceAsOf !== noTime ? sourceAsOf : (status?.loadedAtMicros ?? null);
  return micros === null || micros === noTime
    ? null
    : { ms: Number(micros / microsPerMilli), time: statusTime(micros) };
}

/** A badge's text and the explanation it shows on hover. */
interface Note {
  readonly text: string;
  readonly title: string;
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

export { ageText, asOfOf, detailsOf, failedOf, nansOf, rowsText, statusTime };
