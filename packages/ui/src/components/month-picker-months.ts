/* The months a MonthPicker shows, by plain rules: their names, whether one is within the field's bounds, the bound a
 * month past one is held to, and the month an arrow key moves to. */

/** The earliest and latest months a field takes, either left out for none. */
interface MonthBounds {
  readonly min?: Temporal.PlainYearMonth | undefined;
  readonly max?: Temporal.PlainYearMonth | undefined;
}

const locale = "en-US";
const monthsPerYear = 12;
/** A row of the months is a quarter. */
const monthsPerRow = 3;
const months = Array.from({ length: monthsPerYear }, (_unused, index) => index + 1);

/** A month in words: "November 2026". */
function monthName(month: Temporal.PlainYearMonth): string {
  return month.toPlainDate({ day: 1 }).toLocaleString(locale, { month: "long", year: "numeric" });
}

/** A month's short name: "Nov". */
function shortName(month: Temporal.PlainYearMonth): string {
  return month.toPlainDate({ day: 1 }).toLocaleString(locale, { month: "short" });
}

/** Whether `month` lies within the bounds. */
function within(month: Temporal.PlainYearMonth, { min, max }: MonthBounds): boolean {
  return (
    (min === undefined || Temporal.PlainYearMonth.compare(month, min) >= 0) &&
    (max === undefined || Temporal.PlainYearMonth.compare(month, max) <= 0)
  );
}

/** `month`, or the bound it lies past, so the month focused is always one the field takes and Tab can reach. */
function clamped(
  month: Temporal.PlainYearMonth,
  { min, max }: MonthBounds,
): Temporal.PlainYearMonth {
  if (min !== undefined && Temporal.PlainYearMonth.compare(month, min) < 0) {
    return min;
  }
  return max !== undefined && Temporal.PlainYearMonth.compare(month, max) > 0 ? max : month;
}

/** Whether a year holds any month within the bounds. */
function yearWithin(year: number, { min, max }: MonthBounds): boolean {
  return (min === undefined || year >= min.year) && (max === undefined || year <= max.year);
}

/** The month an arrow key moves to from `month`: one either way, or a row, a quarter, up or down. */
function moved(month: Temporal.PlainYearMonth, key: string): Temporal.PlainYearMonth | undefined {
  const steps: Readonly<Record<string, number>> = {
    ArrowDown: monthsPerRow,
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -monthsPerRow,
  };
  const step = steps[key];
  return step === undefined ? undefined : month.add({ months: step });
}

export { clamped, monthName, months, moved, shortName, within, yearWithin };
export type { MonthBounds };
