/* The text `DateTime` shows, through the formatter, so a time reads as it does in parallax's grid: an instant in New
 * York time unless another zone is named, a wall-clock time as stored, and a date as it is, never through a zone.
 * Values arrive as Temporal's types or as the ISO 8601 text APIs send: with an offset or `Z` it is an instant, with a
 * bracketed zone and no offset an instant in that zone, a bare date a date, and anything else a wall-clock time.
 *
 * Bad data never breaks the page it is on: text that is not ISO 8601, and a zone the platform does not know, show the
 * formatter's dash for an undefined result, as `Num` does for NaN, with the reason as the title. */

import {
  FormatError,
  createFormatter,
  defaultZone,
  nullText,
  outOfRangeText,
  undefinedText,
} from "#format/format.ts";
import type { Formatter, TimePrecision } from "#format/format.ts";

/** A time as APIs send it, or as Temporal holds it. `null` and `undefined` show the formatter's text for null. */
type DateTimeValue =
  | Temporal.Instant
  | Temporal.ZonedDateTime
  | Temporal.PlainDateTime
  | Temporal.PlainDate
  | string
  | null
  | undefined;

/** Which part of a time to show: both, the date in the display zone, or the time. A date shows itself whichever. */
type DateTimePart = "date-time" | "date" | "time";

interface DateTimeFormat {
  /** The IANA zone instants are shown in; New York unless set. */
  readonly zone?: string | undefined;
  /** The sub-second digits shown; whole seconds unless set. */
  readonly precision?: TimePrecision | undefined;
  readonly show?: DateTimePart | undefined;
}

/** What `DateTime` renders: its text, the machine-readable value for `<time dateTime>`, and the full instant for its
 * title. */
interface ShownTime {
  readonly text: string;
  readonly dateTime: string | undefined;
  readonly title: string | undefined;
}

const nanosPerMicro = 1000n;
const noNanos = 0n;
const oneMicro = 1n;
const msPerDay = 86_400_000;
const formatterCacheSize = 32;
const formatters = new Map<string, Formatter>();

/** A formatter for a zone and precision, or the reason the formatter's `FormatError` gives for a zone the platform
 * does not know. */
function madeFormatter(zone: string, precision: TimePrecision): Formatter | string {
  try {
    return createFormatter({ precision, zone });
  } catch (error) {
    if (error instanceof FormatError) {
      return error.message;
    }
    throw error;
  }
}

/** The formatter for a zone and precision, made once: each builds a time zone formatter. For a zone the platform does
 * not know, the reason, which the formatter's `FormatError` gives. */
function formatterFor(zone: string, precision: TimePrecision): Formatter | string {
  const key = `${zone} ${precision}`;
  const cached = formatters.get(key);
  if (cached !== undefined) {
    return cached;
  }
  if (formatters.size >= formatterCacheSize) {
    formatters.clear();
  }
  const made = madeFormatter(zone, precision);
  if (typeof made !== "string") {
    formatters.set(key, made);
  }
  return made;
}

/** Microseconds since the epoch, rounded toward the past, so a time is never shown later than it happened. */
function microsOf(nanoseconds: bigint): bigint {
  const micros = nanoseconds / nanosPerMicro;
  return nanoseconds % nanosPerMicro < noNanos ? micros - oneMicro : micros;
}

/** Why text is no time: it names the text and the forms it may take. */
function notATime(text: string): string {
  return `"${text}" is not an ISO 8601 date or time, such as 2026-11-06, 2026-11-06T14:30:00Z or 2026-11-06T09:30:00-05:00.`;
}

/** ISO 8601 text as the Temporal value it names, or `undefined` for anything else. */
function temporalOf(
  text: string,
):
  | Temporal.Instant
  | Temporal.PlainDate
  | Temporal.PlainDateTime
  | Temporal.ZonedDateTime
  | undefined {
  try {
    if (/^[+-]?\d{4,6}-\d{2}-\d{2}$/u.test(text)) {
      return Temporal.PlainDate.from(text);
    }
    try {
      return Temporal.Instant.from(text);
    } catch {
      // No offset: a bracketed zone, or a wall-clock time.
    }
    return text.includes("[")
      ? Temporal.ZonedDateTime.from(text)
      : Temporal.PlainDateTime.from(text);
  } catch {
    return undefined;
  }
}

/** What a time that cannot be shown shows: the dash for an undefined result, with the reason as its title. */
function unshown(reason: string): ShownTime {
  return { dateTime: undefined, text: undefinedText, title: reason };
}

/** One part of the formatter's `YYYY-MM-DD hh:mm:ss` text. */
function partOf(text: string, show: DateTimePart): string {
  if (show === "date-time" || text === outOfRangeText) {
    return text;
  }
  const [date = text, time = text] = text.split(" ");
  return show === "date" ? date : time;
}

function dateShown(date: Temporal.PlainDate, formatter: Formatter): ShownTime {
  const days = date.toZonedDateTime("UTC").epochMilliseconds / msPerDay;
  return { dateTime: date.toString(), text: formatter.date(days), title: undefined };
}

function wallClockShown(
  time: Temporal.PlainDateTime,
  formatter: Formatter,
  show: DateTimePart,
): ShownTime {
  const micros = microsOf(time.toZonedDateTime("UTC").epochNanoseconds);
  return {
    dateTime: time.toString(),
    text: partOf(formatter.timestamp(micros, false), show),
    title: `${time.toString()}, with no time zone`,
  };
}

function instantShown(
  instant: Temporal.Instant,
  formatter: Formatter,
  show: DateTimePart,
): ShownTime {
  return {
    dateTime: instant.toString(),
    text: partOf(formatter.timestamp(microsOf(instant.epochNanoseconds), true), show),
    title: instant.toZonedDateTimeISO(formatter.zone).toString(),
  };
}

/** A Temporal value through the formatter, by its kind. */
function timeShown(
  time: Temporal.Instant | Temporal.PlainDate | Temporal.PlainDateTime | Temporal.ZonedDateTime,
  formatter: Formatter,
  show: DateTimePart,
): ShownTime {
  if (time instanceof Temporal.PlainDate) {
    return dateShown(time, formatter);
  }
  if (time instanceof Temporal.PlainDateTime) {
    return wallClockShown(time, formatter, show);
  }
  return instantShown(
    time instanceof Temporal.ZonedDateTime ? time.toInstant() : time,
    formatter,
    show,
  );
}

/** A time as `DateTime` shows it. Text that is not ISO 8601, and an unknown zone, show the dash for an undefined
 * result, the reason as the title. */
function dateTimeShown(value: DateTimeValue, format: DateTimeFormat = {}): ShownTime {
  if (value === null || value === undefined) {
    return { dateTime: undefined, text: nullText, title: undefined };
  }
  const formatter = formatterFor(format.zone ?? defaultZone, format.precision ?? "seconds");
  if (typeof formatter === "string") {
    return unshown(formatter);
  }
  const time = typeof value === "string" ? temporalOf(value) : value;
  return time === undefined
    ? unshown(notATime(String(value)))
    : timeShown(time, formatter, format.show ?? "date-time");
}

export { dateTimeShown };
export type { DateTimeFormat, DateTimePart, DateTimeValue, ShownTime };
