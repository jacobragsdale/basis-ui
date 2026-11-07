/* Business days on a calendar, SIFMA's unless the caller names another. A business day is one the market trades,
 * early closes included. */

import type { Calendar } from "./calendar.ts";
import { sifma } from "./sifma.ts";

/** The calendar a query uses; SIFMA's by default. */
interface CalendarOption {
  readonly calendar?: Calendar;
}

/** Whether the market trades on `date`, for all or part of the day. */
function isBusinessDay(
  date: Temporal.PlainDate,
  { calendar = sifma }: CalendarOption = {},
): boolean {
  return calendar.day(date).kind !== "closed";
}

/** The first business day after `date`. */
function nextBusinessDay(
  date: Temporal.PlainDate,
  options: CalendarOption = {},
): Temporal.PlainDate {
  let day = date.add({ days: 1 });
  while (!isBusinessDay(day, options)) {
    day = day.add({ days: 1 });
  }
  return day;
}

/** The last business day before `date`. */
function previousBusinessDay(
  date: Temporal.PlainDate,
  options: CalendarOption = {},
): Temporal.PlainDate {
  let day = date.subtract({ days: 1 });
  while (!isBusinessDay(day, options)) {
    day = day.subtract({ days: 1 });
  }
  return day;
}

/** `date` if it is a business day, or else the last business day before it. */
function businessDayOnOrBefore(
  date: Temporal.PlainDate,
  options: CalendarOption = {},
): Temporal.PlainDate {
  return isBusinessDay(date, options) ? date : previousBusinessDay(date, options);
}

/** `date` if it is a business day, or else the first business day after it. */
function businessDayOnOrAfter(
  date: Temporal.PlainDate,
  options: CalendarOption = {},
): Temporal.PlainDate {
  return isBusinessDay(date, options) ? date : nextBusinessDay(date, options);
}

/** The business day `days` business days after `date`, or before it when `days` is negative: each step moves to the
 * next business day in that direction, so the first step from a closed day lands on the nearest business day. Zero
 * days leaves `date` as it is. */
function addBusinessDays(
  date: Temporal.PlainDate,
  days: number,
  options: CalendarOption = {},
): Temporal.PlainDate {
  if (!Number.isSafeInteger(days)) {
    throw new RangeError(`addBusinessDays needs a whole number of days, not ${String(days)}.`);
  }
  let day = date;
  for (let step = 0; step < Math.abs(days); step += 1) {
    day = days > 0 ? nextBusinessDay(day, options) : previousBusinessDay(day, options);
  }
  return day;
}

/** The business days after `start` up to and including `end`, negative when `end` comes first. So
 * `addBusinessDays(start, businessDaysBetween(start, end))` is `end` whenever `end` is a business day. */
function businessDaysBetween(
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
  options: CalendarOption = {},
): number {
  const order = Temporal.PlainDate.compare(start, end);
  if (order > 0) {
    return -businessDaysBetween(end, start, options);
  }
  let count = 0;
  for (
    let day = start.add({ days: 1 });
    Temporal.PlainDate.compare(day, end) <= 0;
    day = day.add({ days: 1 })
  ) {
    if (isBusinessDay(day, options)) {
      count += 1;
    }
  }
  return count;
}

/** Whether `date` is a business day that closes early. */
function isEarlyClose(
  date: Temporal.PlainDate,
  { calendar = sifma }: CalendarOption = {},
): boolean {
  return calendar.day(date).kind === "early-close";
}

/** When the market closes on `date`, in its session's zone: the regular close, an early close, or `undefined` on a
 * day it does not trade. */
function closingTime(
  date: Temporal.PlainDate,
  { calendar = sifma }: CalendarOption = {},
): Temporal.PlainTime | undefined {
  const day = calendar.day(date);
  return day.kind === "closed" ? undefined : day.closes;
}

export {
  addBusinessDays,
  businessDayOnOrAfter,
  businessDayOnOrBefore,
  businessDaysBetween,
  closingTime,
  isBusinessDay,
  isEarlyClose,
  nextBusinessDay,
  previousBusinessDay,
};
export type { CalendarOption };
