/* What the date pickers share: today in New York, the default as-of date, reading a typed date, the reason a date
 * cannot be picked, and the words a day's cell is named by. An as-of or a range picker takes business days only, on
 * the calendar the field names, SIFMA's unless it names another, between its earliest and latest dates; DatePicker
 * takes any day between them, its grid still marking the days the market closes. */

import { previousBusinessDay } from "#dates/business-days.ts";
import type { Calendar, MarketDay } from "#dates/calendar.ts";
import { sifma } from "#dates/sifma.ts";
import { defaultZone } from "#format/format.ts";

/** What a field allows: business days on its calendar, or any day when `anyDay`, from `min` to `max` when they are
 * set. */
interface PickRules {
  readonly calendar: Calendar;
  readonly anyDay?: boolean | undefined;
  readonly min: Temporal.PlainDate | undefined;
  readonly max: Temporal.PlainDate | undefined;
}

/** A date read from typed text, or why it cannot be read. */
type DateReading =
  | { readonly ok: true; readonly value: Temporal.PlainDate }
  | { readonly ok: false; readonly reason: string };

interface AsOfOptions {
  /** The calendar whose business days count; SIFMA's unless set. */
  readonly calendar?: Calendar | undefined;
  /** The day to count back from; today in New York unless set. */
  readonly today?: Temporal.PlainDate | undefined;
}

const monthsPerYear = 12;
const locale = "en-US";

/** Today's date in New York, the zone the firm's UIs show time in. */
function todayInNewYork(): Temporal.PlainDate {
  return Temporal.Now.plainDateISO(defaultZone);
}

/** The as-of date a field starts at: the last business day before today, the last close whose data is complete. */
function defaultAsOfDate({ calendar = sifma, today }: AsOfOptions = {}): Temporal.PlainDate {
  return previousBusinessDay(today ?? todayInNewYork(), { calendar });
}

function refuse(reason: string): DateReading {
  return { ok: false, reason };
}

const isoShape = /^(?<year>\d{4})-(?<month>\d{1,2})-(?<day>\d{1,2})$/u;
const usShape = /^(?<month>\d{1,2})\/(?<day>\d{1,2})\/(?<year>\d{4})$/u;

/** The month and year of a date, in words: "November 2026". */
function monthText(date: Temporal.PlainDate): string {
  return date.toLocaleString(locale, { month: "long", year: "numeric" });
}

/** The year, month and day a typed date names, in either form, before they are checked. */
function partsOf(
  text: string,
): { readonly year: number; readonly month: number; readonly day: number } | undefined {
  const trimmed = text.trim();
  const groups = (isoShape.exec(trimmed) ?? usShape.exec(trimmed))?.groups;
  if (groups === undefined) {
    return undefined;
  }
  return {
    day: Number(groups["day"]),
    month: Number(groups["month"]),
    year: Number(groups["year"]),
  };
}

/** Reads a typed date, `2026-11-06` or the US `11/6/2026`, or says why it cannot. */
function readDate(text: string): DateReading {
  const parts = partsOf(text);
  if (parts === undefined) {
    return refuse(`"${text}" is not a date: write it as 2026-11-06 or 11/06/2026.`);
  }
  const { day, month, year } = parts;
  if (month < 1 || month > monthsPerYear) {
    return refuse(`"${text}" is not a date: a year has 12 months.`);
  }
  const first = Temporal.PlainDate.from({ day: 1, month, year });
  if (day < 1 || day > first.daysInMonth) {
    return refuse(
      `"${text}" is not a date: ${monthText(first)} has ${String(first.daysInMonth)} days.`,
    );
  }
  return { ok: true, value: first.with({ day }) };
}

/** A field's rules from its props: the latest date is today unless the field sets one, and none when it sets `null`. */
function pickRules({
  calendar,
  max,
  min,
  today,
  anyDay = false,
}: {
  readonly calendar: Calendar;
  readonly min: Temporal.PlainDate | undefined;
  readonly max: Temporal.PlainDate | null | undefined;
  readonly today: Temporal.PlainDate;
  readonly anyDay?: boolean | undefined;
}): PickRules {
  return { anyDay, calendar, max: max === undefined ? today : (max ?? undefined), min };
}

/** Why a closed day cannot be picked, in the calendar's words. */
function closedReason(date: Temporal.PlainDate, reason: string, calendar: Calendar): string {
  const where = `the ${calendar.name} calendar`;
  return reason === "Weekend"
    ? `${date.toString()} is a ${date.toLocaleString(locale, { weekday: "long" })}, not a business day on ${where}.`
    : `${date.toString()} is not a business day on ${where}: it closes for ${reason}.`;
}

/** Why `date` cannot be picked: before the earliest date, after the latest, or, unless the field takes any day, a day
 * the market is closed. `undefined` when it can. */
function whyNotPickable(date: Temporal.PlainDate, rules: PickRules): string | undefined {
  const { anyDay = false, calendar, max, min } = rules;
  if (min !== undefined && Temporal.PlainDate.compare(date, min) < 0) {
    return `${date.toString()} is before ${min.toString()}, the earliest date this field takes.`;
  }
  if (max !== undefined && Temporal.PlainDate.compare(date, max) > 0) {
    return `${date.toString()} is after ${max.toString()}, the latest date this field takes.`;
  }
  if (anyDay) {
    return undefined;
  }
  const day = calendar.day(date);
  return day.kind === "closed" ? closedReason(date, day.reason, calendar) : undefined;
}

/** A day's market note: why it is closed, or when it closes early; `undefined` on a regular day. */
function marketNote(day: MarketDay): string | undefined {
  switch (day.kind) {
    case "closed": {
      return `closed: ${day.reason}`;
    }
    case "early-close": {
      return `closes early at ${day.closes.toString({ smallestUnit: "minute" })}: ${day.reason}`;
    }
    case "open": {
      return undefined;
    }
    default: {
      return day satisfies never;
    }
  }
}

/** The name of a day's cell: its date in words and, on an irregular day, its market note. */
function dayLabel(date: Temporal.PlainDate, day: MarketDay): string {
  const words = date.toLocaleString(locale, {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
  });
  const note = marketNote(day);
  return note === undefined ? words : `${words}, ${note}`;
}

/** Whether two optional dates are the same day. */
function sameDate(
  left: Temporal.PlainDate | null | undefined,
  right: Temporal.PlainDate | null | undefined,
): boolean {
  const first = left ?? null;
  const second = right ?? null;
  if (first === null || second === null) {
    return first === second;
  }
  return first.equals(second);
}

export {
  dayLabel,
  defaultAsOfDate,
  marketNote,
  monthText,
  pickRules,
  readDate,
  sameDate,
  todayInNewYork,
  whyNotPickable,
};
export type { AsOfOptions, DateReading, PickRules };
