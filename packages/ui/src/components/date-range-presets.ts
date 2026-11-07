/* The ranges DateRangePicker offers, from the dates module: month, quarter and year to date, and the whole month,
 * quarter and year before. Each runs from its period's first business day to a business day, so a range never starts
 * or ends on a day the market is closed. */

import { businessDayOnOrAfter } from "#dates/business-days.ts";
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
  | "prior-year";

interface PresetDefinition {
  readonly label: string;
  readonly period: Period;
  readonly prior: boolean;
}

const presetDefinitions: Readonly<Record<DateRangePreset, PresetDefinition>> = {
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
];

/** A preset's label, such as "Quarter to date". */
function presetLabel(preset: DateRangePreset): string {
  return presetDefinitions[preset].label;
}

/** A preset's range as of a date, on a calendar, SIFMA's unless set. To date runs from the period's first business day
 * to the last business day on or before `asOf`; a prior period from its first business day to its last. */
function rangeForPreset(
  preset: DateRangePreset,
  asOf: Temporal.PlainDate,
  calendar: Calendar = sifma,
): DateRange {
  const { period, prior } = presetDefinitions[preset];
  if (!prior) {
    return businessPeriodToDate(period, asOf, { calendar });
  }
  const end = priorBusinessPeriodEnd(period, asOf, { calendar });
  return { end, start: businessDayOnOrAfter(periodStart(period, end), { calendar }) };
}

export { dateRangePresets, presetLabel, rangeForPreset };
export type { DateRangePreset };
