/* A market calendar is its rules, which give each year's closures and early closes, plus a dated list of exceptions,
 * since markets also close on days no rule foresees: a national day of mourning, a hurricane. An exception wins over
 * the rules on its day and changes no other day. */

import { isWeekend } from "./rules.ts";

/** A day that a calendar's rules or exceptions make irregular: closed all day, or closing early at `closes`. */
interface Irregular {
  readonly closes: Temporal.PlainTime | undefined;
  readonly reason: string;
}

/** How a market trades on a day: its regular session, an early close, or not at all. Times are in the calendar's
 * session zone. */
type MarketDay =
  | {
      readonly kind: "open";
      readonly date: Temporal.PlainDate;
      readonly opens: Temporal.PlainTime;
      readonly closes: Temporal.PlainTime;
    }
  | {
      readonly kind: "early-close";
      readonly date: Temporal.PlainDate;
      readonly opens: Temporal.PlainTime;
      readonly closes: Temporal.PlainTime;
      readonly reason: string;
    }
  | { readonly kind: "closed"; readonly date: Temporal.PlainDate; readonly reason: string };

/** A day on which a market did not, or will not, follow its calendar's rules, and the published notice that says so.
 * `"open"` restores the regular session on a day the rules would close or close early. */
type CalendarException =
  | {
      readonly date: string;
      readonly kind: "closed";
      readonly reason: string;
      readonly source: string;
    }
  | {
      readonly date: string;
      readonly kind: "open";
      readonly reason: string;
      readonly source: string;
    }
  | {
      readonly date: string;
      readonly kind: "early-close";
      readonly closes: string;
      readonly reason: string;
      readonly source: string;
    };

/** A market's regular session: when it opens and closes on a business day, in its own time zone. */
interface Session {
  readonly zone: string;
  readonly opens: Temporal.PlainTime;
  readonly closes: Temporal.PlainTime;
  /** Where the hours come from. */
  readonly source: string;
}

/** What a calendar's rules write into one year: its closures and early closes, and the business days its rules
 * need, such as the day before a holiday, which depend on the closures written so far. */
interface YearWriter {
  readonly year: number;
  readonly close: (date: Temporal.PlainDate, reason: string) => void;
  readonly closeEarly: (
    date: Temporal.PlainDate,
    closes: Temporal.PlainTime,
    reason: string,
  ) => void;
  /** The last weekday before `date` that the rules have not closed. */
  readonly businessDayBefore: (date: Temporal.PlainDate) => Temporal.PlainDate;
}

interface CalendarDefinition {
  readonly id: string;
  readonly name: string;
  readonly session: Session;
  /** The publications the rules come from. */
  readonly sources: readonly string[];
  /** The last year whose schedule its publisher had published, and this calendar was checked against, when it was
   * written; infinite for standing rules. Later years follow the rules, which the publisher has yet to confirm. */
  readonly publishedThrough: number;
  readonly exceptions: readonly CalendarException[];
  readonly rules: (year: YearWriter) => void;
}

/** A market's calendar: `day` says how the market trades on a date. */
interface Calendar {
  readonly id: string;
  readonly name: string;
  readonly session: Session;
  readonly sources: readonly string[];
  readonly publishedThrough: number;
  readonly exceptions: readonly CalendarException[];
  readonly day: (date: Temporal.PlainDate) => MarketDay;
}

/** One year's irregular days, as the rules write them. */
function writeYear(
  year: number,
  rules: CalendarDefinition["rules"],
): ReadonlyMap<string, Irregular> {
  const days = new Map<string, Irregular>();
  const isClosed = (date: Temporal.PlainDate): boolean => {
    const irregular = days.get(date.toString());
    return isWeekend(date) || (irregular !== undefined && irregular.closes === undefined);
  };
  rules({
    businessDayBefore(date) {
      let day = date.subtract({ days: 1 });
      while (isClosed(day)) {
        day = day.subtract({ days: 1 });
      }
      return day;
    },
    close(date, reason) {
      days.set(date.toString(), { closes: undefined, reason });
    },
    closeEarly(date, closes, reason) {
      days.set(date.toString(), { closes, reason });
    },
    year,
  });
  return days;
}

function irregularOf(exception: CalendarException): Irregular | undefined {
  switch (exception.kind) {
    case "closed": {
      return { closes: undefined, reason: exception.reason };
    }
    case "early-close": {
      return { closes: Temporal.PlainTime.from(exception.closes), reason: exception.reason };
    }
    case "open": {
      return undefined;
    }
    default: {
      return exception satisfies never;
    }
  }
}

/** A day's schedule from its irregularity, if it has one, and the calendar's session. */
function marketDay(
  date: Temporal.PlainDate,
  irregular: Irregular | undefined,
  session: Session,
): MarketDay {
  if (irregular === undefined) {
    return { closes: session.closes, date, kind: "open", opens: session.opens };
  }
  if (irregular.closes === undefined) {
    return { date, kind: "closed", reason: irregular.reason };
  }
  return {
    closes: irregular.closes,
    date,
    kind: "early-close",
    opens: session.opens,
    reason: irregular.reason,
  };
}

const weekend: Irregular = { closes: undefined, reason: "Weekend" };

/** A calendar from its rules and exceptions. Each year's rules run once, when a date in it is first asked about. */
function createCalendar(definition: CalendarDefinition): Calendar {
  const years = new Map<number, ReadonlyMap<string, Irregular>>();
  const exceptions = new Map(
    definition.exceptions.map((exception) => [exception.date, exception] as const),
  );

  function rulesFor(year: number): ReadonlyMap<string, Irregular> {
    const written = years.get(year) ?? writeYear(year, definition.rules);
    years.set(year, written);
    return written;
  }

  /** An exception wins over the weekend and the rules; a weekend wins over the rules. */
  function scheduled(date: Temporal.PlainDate): Irregular | undefined {
    const key = date.toString();
    const exception = exceptions.get(key);
    if (exception !== undefined) {
      return irregularOf(exception);
    }
    return isWeekend(date) ? weekend : rulesFor(date.year).get(key);
  }

  return {
    day: (date) => marketDay(date, scheduled(date), definition.session),
    exceptions: definition.exceptions,
    id: definition.id,
    name: definition.name,
    publishedThrough: definition.publishedThrough,
    session: definition.session,
    sources: definition.sources,
  };
}

export { createCalendar };
export type { Calendar, CalendarDefinition, CalendarException, MarketDay, Session, YearWriter };
