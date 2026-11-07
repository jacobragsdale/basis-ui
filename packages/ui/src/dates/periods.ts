/* The periods an as-of date picker offers: month, quarter and year to date, and the end of the period before, in
 * calendar days and in business days. */

import { businessDayOnOrAfter, businessDayOnOrBefore } from "./business-days.ts";
import type { CalendarOption } from "./business-days.ts";

/** A calendar month, quarter or year. */
type Period = "month" | "quarter" | "year";

/** The days from `start` to `end`, both included. */
interface DateRange {
  readonly start: Temporal.PlainDate;
  readonly end: Temporal.PlainDate;
}

const monthsPerQuarter = 3;

/** The first day of the period that holds `date`. */
function periodStart(period: Period, date: Temporal.PlainDate): Temporal.PlainDate {
  switch (period) {
    case "month": {
      return date.with({ day: 1 });
    }
    case "quarter": {
      const firstMonth = date.month - ((date.month - 1) % monthsPerQuarter);
      return date.with({ day: 1, month: firstMonth });
    }
    case "year": {
      return date.with({ day: 1, month: 1 });
    }
    default: {
      return period satisfies never;
    }
  }
}

/** The last day of the period that holds `date`. */
function periodEnd(period: Period, date: Temporal.PlainDate): Temporal.PlainDate {
  const months = { month: 1, quarter: monthsPerQuarter, year: date.monthsInYear }[period];
  return periodStart(period, date).add({ months }).subtract({ days: 1 });
}

/** From the first day of the period holding `asOf` to `asOf`. */
function periodToDate(period: Period, asOf: Temporal.PlainDate): DateRange {
  return { end: asOf, start: periodStart(period, asOf) };
}

/** The last day of the period before the one holding `asOf`: the prior month end, quarter end or year end. */
function priorPeriodEnd(period: Period, asOf: Temporal.PlainDate): Temporal.PlainDate {
  return periodStart(period, asOf).subtract({ days: 1 });
}

/** The business-day form of `periodToDate`: from the period's first business day to the last business day on or
 * before `asOf`. The as-of date moves back first, so an as-of date on a holiday that opens a period, such as New
 * Year's Day, gives the whole period before it. */
function businessPeriodToDate(
  period: Period,
  asOf: Temporal.PlainDate,
  options: CalendarOption = {},
): DateRange {
  const end = businessDayOnOrBefore(asOf, options);
  return { end, start: businessDayOnOrAfter(periodStart(period, end), options) };
}

/** The business-day form of `priorPeriodEnd`: the last business day of the period before the one holding the last
 * business day on or before `asOf`, the base date a period's change is measured from. */
function priorBusinessPeriodEnd(
  period: Period,
  asOf: Temporal.PlainDate,
  options: CalendarOption = {},
): Temporal.PlainDate {
  return businessDayOnOrBefore(
    priorPeriodEnd(period, businessDayOnOrBefore(asOf, options)),
    options,
  );
}

/** The last business day of the month holding `date`. */
function lastBusinessDayOfMonth(
  date: Temporal.PlainDate,
  options: CalendarOption = {},
): Temporal.PlainDate {
  return businessDayOnOrBefore(periodEnd("month", date), options);
}

/** The last business day of the quarter holding `date`. */
function lastBusinessDayOfQuarter(
  date: Temporal.PlainDate,
  options: CalendarOption = {},
): Temporal.PlainDate {
  return businessDayOnOrBefore(periodEnd("quarter", date), options);
}

export {
  businessPeriodToDate,
  lastBusinessDayOfMonth,
  lastBusinessDayOfQuarter,
  periodEnd,
  periodStart,
  periodToDate,
  priorBusinessPeriodEnd,
  priorPeriodEnd,
};
export type { DateRange, Period };
