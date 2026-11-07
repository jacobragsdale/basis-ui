/* Whether a market is trading at an instant, and when it next opens and closes, from its calendar and its session
 * hours. Times come back in New York time, the zone the firm's UIs show instants in. */

import type { CalendarOption } from "./business-days.ts";
import type { Calendar, MarketDay } from "./calendar.ts";
import { sifma } from "./sifma.ts";

const displayZone = "America/New_York";
/** How far ahead to look for a trading day, longer than any closure a calendar has known. */
const searchDays = 31;

/** A market's state at an instant: `"open"` in a regular session, `"early-close"` in a session that ends early, and
 * `"closed"` otherwise. `nextOpen` and `nextClose` are the first opening and closing after the instant, so while the
 * market is open `nextClose` is the close of today's session and `nextOpen` the open of the next one. */
interface MarketStatus {
  readonly state: "open" | "early-close" | "closed";
  readonly nextOpen: Temporal.ZonedDateTime;
  readonly nextClose: Temporal.ZonedDateTime;
  /** The day of the session `nextClose` ends, in the calendar's zone, with the reason for an early close. */
  readonly day: MarketDay;
}

interface SessionTimes {
  readonly opens: Temporal.Instant;
  readonly closes: Temporal.Instant;
  readonly day: Extract<MarketDay, { kind: "open" | "early-close" }>;
}

function sessionOn(calendar: Calendar, date: Temporal.PlainDate): SessionTimes | undefined {
  const day = calendar.day(date);
  if (day.kind === "closed") {
    return undefined;
  }
  const timeZone = calendar.session.zone;
  return {
    closes: date.toZonedDateTime({ plainTime: day.closes, timeZone }).toInstant(),
    day,
    opens: date.toZonedDateTime({ plainTime: day.opens, timeZone }).toInstant(),
  };
}

/** The first session on or after `date` that has not closed by `at`. */
function sessionFrom(
  calendar: Calendar,
  date: Temporal.PlainDate,
  at: Temporal.Instant,
): SessionTimes {
  for (let offset = 0; offset <= searchDays; offset += 1) {
    const session = sessionOn(calendar, date.add({ days: offset }));
    if (session !== undefined && Temporal.Instant.compare(at, session.closes) < 0) {
      return session;
    }
  }
  throw new RangeError(
    `${calendar.name} has no session in the ${String(searchDays)} days after ${date.toString()}.`,
  );
}

function shown(instant: Temporal.Instant): Temporal.ZonedDateTime {
  return instant.toZonedDateTimeISO(displayZone);
}

/** A market's state at `at` on a calendar, SIFMA's unless another is named. */
function marketStatus(
  at: Temporal.Instant,
  { calendar = sifma }: CalendarOption = {},
): MarketStatus {
  const today = at.toZonedDateTimeISO(calendar.session.zone).toPlainDate();
  const session = sessionFrom(calendar, today, at);
  if (Temporal.Instant.compare(at, session.opens) < 0) {
    return {
      day: session.day,
      nextClose: shown(session.closes),
      nextOpen: shown(session.opens),
      state: "closed",
    };
  }
  const next = sessionFrom(calendar, session.day.date, session.closes);
  return {
    day: session.day,
    nextClose: shown(session.closes),
    nextOpen: shown(next.opens),
    state: session.day.kind === "early-close" ? "early-close" : "open",
  };
}

export { marketStatus };
export type { MarketStatus };
