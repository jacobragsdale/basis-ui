/* The month grid's layout and keys, by the WAI-ARIA date picker dialog pattern: the arrows move a day or a week,
 * Home and End to the start and end of the week, PageUp and PageDown a month, and with Shift a year. Weeks start on
 * Sunday, as US calendars print them. */

/** The days of one week, Sunday first; `undefined` for a day outside the month. */
type Week = readonly (Temporal.PlainDate | undefined)[];

const daysPerWeek = 7;
/** Six weeks hold any month, and a grid of six keeps its height from month to month. */
const weeksShown = 6;

/** The weekday names over the grid's columns, Sunday first: the short text shown and the full name read out. */
const weekdays = [
  ["Su", "Sunday"],
  ["Mo", "Monday"],
  ["Tu", "Tuesday"],
  ["We", "Wednesday"],
  ["Th", "Thursday"],
  ["Fr", "Friday"],
  ["Sa", "Saturday"],
] as const;

/** A date's column: 0 for Sunday to 6 for Saturday. Temporal counts Monday as 1 and Sunday as 7. */
function columnOf(date: Temporal.PlainDate): number {
  return date.dayOfWeek % daysPerWeek;
}

/** The six weeks of the month holding `date`, each day in its weekday's column. */
function monthWeeks(date: Temporal.PlainDate): readonly Week[] {
  const first = date.with({ day: 1 });
  const lead = columnOf(first);
  return Array.from({ length: weeksShown }, (_week, row) =>
    Array.from({ length: daysPerWeek }, (_day, column) => {
      const day = row * daysPerWeek + column - lead + 1;
      return day >= 1 && day <= first.daysInMonth ? first.with({ day }) : undefined;
    }),
  );
}

/** Where a key moves focus from `date`, or `undefined` for a key the grid does not handle. */
function movedDate(
  date: Temporal.PlainDate,
  key: string,
  shift: boolean,
): Temporal.PlainDate | undefined {
  switch (key) {
    case "ArrowLeft": {
      return date.subtract({ days: 1 });
    }
    case "ArrowRight": {
      return date.add({ days: 1 });
    }
    case "ArrowUp": {
      return date.subtract({ weeks: 1 });
    }
    case "ArrowDown": {
      return date.add({ weeks: 1 });
    }
    case "Home": {
      return date.subtract({ days: columnOf(date) });
    }
    case "End": {
      return date.add({ days: daysPerWeek - 1 - columnOf(date) });
    }
    case "PageUp": {
      return date.subtract(shift ? { years: 1 } : { months: 1 });
    }
    case "PageDown": {
      return date.add(shift ? { years: 1 } : { months: 1 });
    }
    default: {
      return undefined;
    }
  }
}

/** `date` held between the earliest and latest dates, when they are set. */
function clampDate(
  date: Temporal.PlainDate,
  min: Temporal.PlainDate | undefined,
  max: Temporal.PlainDate | undefined,
): Temporal.PlainDate {
  if (min !== undefined && Temporal.PlainDate.compare(date, min) < 0) {
    return min;
  }
  if (max !== undefined && Temporal.PlainDate.compare(date, max) > 0) {
    return max;
  }
  return date;
}

/** Whether any day of the month holding `date` lies between the earliest and latest dates. */
function monthInRange(
  date: Temporal.PlainDate,
  min: Temporal.PlainDate | undefined,
  max: Temporal.PlainDate | undefined,
): boolean {
  const first = date.with({ day: 1 });
  const last = date.with({ day: date.daysInMonth });
  const afterMin = min === undefined || Temporal.PlainDate.compare(last, min) >= 0;
  const beforeMax = max === undefined || Temporal.PlainDate.compare(first, max) <= 0;
  return afterMin && beforeMax;
}

/** Whether `date` lies from `start` to `end`, both included. */
function within(
  date: Temporal.PlainDate,
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
): boolean {
  return Temporal.PlainDate.compare(date, start) >= 0 && Temporal.PlainDate.compare(date, end) <= 0;
}

export { clampDate, monthInRange, monthWeeks, movedDate, weekdays, within };
export type { Week };
