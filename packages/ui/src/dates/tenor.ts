/* Tenors, the lengths of time a curve or a term is quoted in: `1D`, `2W`, `3M`, `10Y`. They add to a date by the
 * calendar, without business-day adjustment, which conventions such as modified following leave to the API.
 *
 * Month-end rules: days and weeks add calendar days. Months and years add calendar months, and a day past the end of
 * the month reached becomes that month's last day, so 31 January + 1M is 28 or 29 February and 29 February 2024 + 1Y
 * is 28 February 2025. With `endOfMonth`, a date on the last day of its month lands on the last day of the month
 * reached, so 28 February 2025 + 1M is 31 March, not 28 March. */

/** A tenor's unit: days, weeks, months or years. */
type TenorUnit = "D" | "W" | "M" | "Y";

interface Tenor {
  readonly count: number;
  readonly unit: TenorUnit;
}

/** A tenor read from text, or why it cannot be read. */
type TenorReading =
  | { readonly ok: true; readonly value: Tenor }
  | { readonly ok: false; readonly reason: string };

const shape = /^(?<count>\d{1,4})(?<unit>[DWMY])$/u;

const units: readonly string[] = ["D", "W", "M", "Y"] satisfies TenorUnit[];
const daysPerWeek = 7;
/** A Julian year, and a twelfth of it for a month: the average lengths that order tenors. */
const daysPerYear = 365.25;
const monthsPerYear = 12;

function isUnit(text: string | undefined): text is TenorUnit {
  return text !== undefined && units.includes(text);
}

/** A unit's average length in days. */
function unitDays(unit: TenorUnit): number {
  switch (unit) {
    case "D": {
      return 1;
    }
    case "W": {
      return daysPerWeek;
    }
    case "M": {
      return daysPerYear / monthsPerYear;
    }
    case "Y": {
      return daysPerYear;
    }
    default: {
      return unit satisfies never;
    }
  }
}

/** Reads a tenor such as `3M` or `10y`: a whole number of 1 or more, then D, W, M or Y in either case. */
function parseTenor(text: string): TenorReading {
  const groups = shape.exec(text.trim().toUpperCase())?.groups;
  const unit = groups?.["unit"];
  const count = Number(groups?.["count"]);
  if (!isUnit(unit)) {
    return {
      ok: false,
      reason: `"${text}" is not a tenor: write a whole number and D, W, M or Y, such as 3M or 10Y.`,
    };
  }
  if (count < 1) {
    return {
      ok: false,
      reason: `"${text}" is not a tenor: it needs a length of at least 1${unit}.`,
    };
  }
  return { ok: true, value: { count, unit } };
}

/** A tenor as text, such as `3M`. */
function tenorText(tenor: Tenor): string {
  return `${String(tenor.count)}${tenor.unit}`;
}

interface AddTenorOptions {
  /** Keep a date on the last day of its month on the last day of the month reached. Off by default. */
  readonly endOfMonth?: boolean;
}

/** The date `tenor` after `date`, by the month-end rules this module states; `endOfMonth` is off by default. */
function addTenor(
  date: Temporal.PlainDate,
  tenor: Tenor,
  { endOfMonth = false }: AddTenorOptions = {},
): Temporal.PlainDate {
  switch (tenor.unit) {
    case "D": {
      return date.add({ days: tenor.count });
    }
    case "W": {
      return date.add({ weeks: tenor.count });
    }
    case "M":
    case "Y": {
      const months = tenor.unit === "M" ? tenor.count : tenor.count * date.monthsInYear;
      const reached = date.add({ months }, { overflow: "constrain" });
      return endOfMonth && date.day === date.daysInMonth
        ? reached.with({ day: reached.daysInMonth })
        : reached;
    }
    default: {
      return tenor.unit satisfies never;
    }
  }
}

/** Orders tenors by length, shortest first: 1D, 1W, 1M, 3M, 1Y, 2Y, 10Y. Tenors of the same length, such as 12M and
 * 1Y, compare equal. */
function compareTenors(left: Tenor, right: Tenor): number {
  return Math.sign(left.count * unitDays(left.unit) - right.count * unitDays(right.unit));
}

export { addTenor, compareTenors, parseTenor, tenorText };
export type { AddTenorOptions, Tenor, TenorReading, TenorUnit };
