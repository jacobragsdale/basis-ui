/* The date arithmetic holiday rules share: weekends, Easter, a holiday's date in a year, and the day off a weekend
 * holiday gives. Weekdays are numbered as Temporal numbers them, Monday 1 to Sunday 7. */

const monday = 1;
const thursday = 4;
const saturday = 6;
const sunday = 7;
const daysPerWeek = 7;

/** Where a holiday falls each year: on a fixed date, on the nth weekday of a month (a negative `nth` counts from the
 * month's end, so -1 is its last), or a number of days from Easter Sunday. */
type DateRule =
  | { readonly kind: "fixed"; readonly month: number; readonly day: number }
  | {
      readonly kind: "weekday";
      readonly month: number;
      readonly weekday: number;
      readonly nth: number;
    }
  | { readonly kind: "easter"; readonly days: number };

/** Whether a date falls on a Saturday or a Sunday. */
function isWeekend(date: Temporal.PlainDate): boolean {
  return date.dayOfWeek >= saturday;
}

/* oxlint-disable eslint/no-magic-numbers -- a computus is its constants; naming each would only hide the algorithm. */
/** How many days after 21 March the Paschal full moon falls, in the Gregorian calendar. */
function epactOf(year: number): number {
  const golden = year % 19;
  const century = Math.trunc(year / 100);
  const correction = Math.trunc((century + 8) / 25);
  const moon = Math.trunc((century - correction + 1) / 3);
  return (19 * golden + century - Math.trunc(century / 4) - moon + 15) % 30;
}

/** Easter Sunday in the Gregorian calendar, by the anonymous Gregorian algorithm, as parallax's Rust computes it. */
function easterSunday(year: number): Temporal.PlainDate {
  const century = Math.trunc(year / 100);
  const yearOfCentury = year % 100;
  const epact = epactOf(year);
  const weekday =
    (32 + 2 * (century % 4) + 2 * Math.trunc(yearOfCentury / 4) - epact - (yearOfCentury % 4)) % 7;
  const shift = Math.trunc(((year % 19) + 11 * epact + 22 * weekday) / 451);
  const total = epact + weekday - 7 * shift + 114;
  return Temporal.PlainDate.from({ day: (total % 31) + 1, month: Math.trunc(total / 31), year });
}
/* oxlint-enable eslint/no-magic-numbers */

/** The `nth` `weekday` of a month. */
function nthWeekday(
  year: number,
  rule: Extract<DateRule, { kind: "weekday" }>,
): Temporal.PlainDate {
  const month = Temporal.PlainYearMonth.from({ month: rule.month, year });
  if (rule.nth > 0) {
    const first = month.toPlainDate({ day: 1 });
    const offset = (rule.weekday - first.dayOfWeek + daysPerWeek) % daysPerWeek;
    return first.add({ days: offset + (rule.nth - 1) * daysPerWeek });
  }
  const last = month.toPlainDate({ day: month.daysInMonth });
  const offset = (last.dayOfWeek - rule.weekday + daysPerWeek) % daysPerWeek;
  return last.subtract({ days: offset + (-rule.nth - 1) * daysPerWeek });
}

/** The date a rule gives in a year. */
function dateOf(rule: DateRule, year: number): Temporal.PlainDate {
  switch (rule.kind) {
    case "fixed": {
      return Temporal.PlainDate.from({ day: rule.day, month: rule.month, year });
    }
    case "weekday": {
      return nthWeekday(year, rule);
    }
    case "easter": {
      return easterSunday(year).add({ days: rule.days });
    }
    default: {
      return rule satisfies never;
    }
  }
}

/** The day off a holiday gives when it falls on a weekend: the Monday after a Sunday, and the Friday before a
 * Saturday, unless `onSaturday` is `"none"`, when a Saturday holiday gives no day off. */
function observed(
  date: Temporal.PlainDate,
  onSaturday: "friday" | "none",
): Temporal.PlainDate | undefined {
  if (date.dayOfWeek === sunday) {
    return date.add({ days: 1 });
  }
  if (date.dayOfWeek === saturday) {
    return onSaturday === "friday" ? date.subtract({ days: 1 }) : undefined;
  }
  return date;
}

export { dateOf, easterSunday, isWeekend, monday, observed, thursday };
export type { DateRule };
