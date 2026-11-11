/* The ranges DateRangePicker offers, from the dates module: month, quarter and year to date, the whole month, quarter
 * and year before, and the trailing month, three months and year to the as-of date. Each runs from a business day to a
 * business day, so a range never starts or ends on a day the market is closed. */

import { businessDayOnOrAfter, businessDayOnOrBefore } from "#dates/business-days.ts";
import type { Calendar } from "#dates/calendar.ts";
import { businessPeriodToDate, periodStart, priorBusinessPeriodEnd } from "#dates/periods.ts";
import type { DateRange, Period } from "#dates/periods.ts";
import { sifma } from "#dates/sifma.ts";

/** A preset's name. */
type DateRangePreset =
  | "month-to-date"
  | "quarter-to-date"
  | "year-to-date"
  | "prior-month"
  | "prior-quarter"
  | "prior-year"
  | "trailing-month"
  | "trailing-3-months"
  | "trailing-year";

/** A period's range: to date, or the whole one before. */
interface PeriodPreset {
  readonly label: string;
  readonly period: Period;
  readonly prior: boolean;
}

/** A trailing range: the months before the as-of date, to it. */
interface TrailingPreset {
  readonly label: string;
  readonly months: number;
}

const trailing: Readonly<
  Record<"trailing-month" | "trailing-3-months" | "trailing-year", TrailingPreset>
> = {
  "trailing-3-months": { label: "Past 3 months", months: 3 },
  "trailing-month": { label: "Past month", months: 1 },
  "trailing-year": { label: "Past year", months: 12 },
};

const presetDefinitions: Readonly<
  Record<Exclude<DateRangePreset, keyof typeof trailing>, PeriodPreset>
> = {
  "month-to-date": { label: "Month to date", period: "month", prior: false },
  "quarter-to-date": { label: "Quarter to date", period: "quarter", prior: false },
  "year-to-date": { label: "Year to date", period: "year", prior: false },
  "prior-month": { label: "Prior month", period: "month", prior: true },
  "prior-quarter": { label: "Prior quarter", period: "quarter", prior: true },
  "prior-year": { label: "Prior year", period: "year", prior: true },
};

/** Every preset, in the order a picker lists them. */
const dateRangePresets: readonly DateRangePreset[] = [
  "month-to-date",
  "quarter-to-date",
  "year-to-date",
  "prior-month",
  "prior-quarter",
  "prior-year",
  "trailing-month",
  "trailing-3-months",
  "trailing-year",
];

function isTrailing(preset: DateRangePreset): preset is keyof typeof trailing {
  return preset in trailing;
}

/** A preset's label, such as "Quarter to date". */
function presetLabel(preset: DateRangePreset): string {
  return isTrailing(preset) ? trailing[preset].label : presetDefinitions[preset].label;
}

/** A preset's range as of a date, on a calendar, SIFMA's unless set. To date runs from the period's first business day
 * to the last business day on or before `asOf`; a prior period from its first business day to its last; a trailing
 * one from the first business day on or after the same date its months before, to the last business day on or before
 * `asOf`. */
function rangeForPreset(
  preset: DateRangePreset,
  asOf: Temporal.PlainDate,
  calendar: Calendar = sifma,
): DateRange {
  if (isTrailing(preset)) {
    const end = businessDayOnOrBefore(asOf, { calendar });
    return {
      end,
      start: businessDayOnOrAfter(asOf.subtract({ months: trailing[preset].months }), { calendar }),
    };
  }
  const { period, prior } = presetDefinitions[preset];
  if (!prior) {
    return businessPeriodToDate(period, asOf, { calendar });
  }
  const end = priorBusinessPeriodEnd(period, asOf, { calendar });
  return { end, start: businessDayOnOrAfter(periodStart(period, end), { calendar }) };
}

export { dateRangePresets, presetLabel, rangeForPreset };
export type { DateRangePreset };
