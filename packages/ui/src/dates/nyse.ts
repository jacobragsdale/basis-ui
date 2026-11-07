/* The New York Stock Exchange's calendar, ported from parallax's Rust (packages/parallax/crates/parallax-engine/src/
 * calendar.rs) and tested against the fixtures it writes, so a UI's business days are its charts' trading days.
 *
 * Full closes, as the rules hold from 2000: New Year's Day, Martin Luther King Jr. Day, Washington's Birthday, Good
 * Friday, Memorial Day, Juneteenth (from 2022), Independence Day, Labor Day, Thanksgiving Day and Christmas Day. A
 * holiday on a Sunday closes the Monday after and one on a Saturday the Friday before, except New Year's Day: the
 * NYSE does not close the Friday that ends the year's books.
 *
 * Early closes, at 1 p.m., which the Rust does not model: 3 July when Independence Day falls on a Tuesday to a Friday,
 * the day after Thanksgiving, and 24 December when Christmas Day falls on a Tuesday to a Friday, as nyse.com
 * publishes them. */

import { createCalendar } from "./calendar.ts";
import type { CalendarException, YearWriter } from "./calendar.ts";
import { dateOf, isWeekend, monday, observed, thursday } from "./rules.ts";
import type { DateRule } from "./rules.ts";

const juneteenthFrom = 2022;
const earlyClose = Temporal.PlainTime.from("13:00");

const holidays = {
  christmas: { day: 25, kind: "fixed", month: 12 },
  goodFriday: { days: -2, kind: "easter" },
  independence: { day: 4, kind: "fixed", month: 7 },
  juneteenth: { day: 19, kind: "fixed", month: 6 },
  kingDay: { kind: "weekday", month: 1, nth: 3, weekday: monday },
  labor: { kind: "weekday", month: 9, nth: 1, weekday: monday },
  memorial: { kind: "weekday", month: 5, nth: -1, weekday: monday },
  newYear: { day: 1, kind: "fixed", month: 1 },
  thanksgiving: { kind: "weekday", month: 11, nth: 4, weekday: thursday },
  washington: { kind: "weekday", month: 2, nth: 3, weekday: monday },
} as const satisfies Record<string, DateRule>;

function writeClosures(writer: YearWriter): void {
  const { year } = writer;
  const on = (rule: DateRule): Temporal.PlainDate => dateOf(rule, year);
  const closures: readonly (readonly [Temporal.PlainDate | undefined, string])[] = [
    [observed(on(holidays.newYear), "none"), "New Year's Day"],
    [on(holidays.kingDay), "Martin Luther King Jr. Day"],
    [on(holidays.washington), "Washington's Birthday"],
    [on(holidays.goodFriday), "Good Friday"],
    [on(holidays.memorial), "Memorial Day"],
    [
      year >= juneteenthFrom ? observed(on(holidays.juneteenth), "friday") : undefined,
      "Juneteenth",
    ],
    [observed(on(holidays.independence), "friday"), "Independence Day"],
    [on(holidays.labor), "Labor Day"],
    [on(holidays.thanksgiving), "Thanksgiving Day"],
    [observed(on(holidays.christmas), "friday"), "Christmas Day"],
  ];
  for (const [date, reason] of closures) {
    if (date !== undefined) {
      writer.close(date, reason);
    }
  }
}

function nyseRules(writer: YearWriter): void {
  writeClosures(writer);
  // An eve closes early only when the holiday falls on its own date midweek, so the eve is a weekday that trades.
  const eves: readonly (readonly [DateRule, string])[] = [
    [holidays.independence, "Before Independence Day"],
    [holidays.christmas, "Before Christmas Day"],
  ];
  for (const [rule, reason] of eves) {
    const holiday = dateOf(rule, writer.year);
    const eve = holiday.subtract({ days: 1 });
    if (!isWeekend(holiday) && !isWeekend(eve)) {
      writer.closeEarly(eve, earlyClose, reason);
    }
  }
  writer.closeEarly(
    dateOf(holidays.thanksgiving, writer.year).add({ days: 1 }),
    earlyClose,
    "After Thanksgiving Day",
  );
}

/** The closures parallax's Rust lists as `SPECIAL_CLOSURES`, with the notices behind them. */
const nyseExceptions: readonly CalendarException[] = [
  ...["2001-09-11", "2001-09-12", "2001-09-13", "2001-09-14"].map((date): CalendarException => ({
    date,
    kind: "closed",
    reason: "The September 11 attacks",
    source: "https://archives.starbulletin.com/2001/09/13/business/market.html",
  })),
  {
    date: "2004-06-11",
    kind: "closed",
    reason: "National Day of Mourning for President Reagan",
    source: "https://www.sec.gov/news/press/2004-77.htm",
  },
  {
    date: "2007-01-02",
    kind: "closed",
    reason: "National Day of Mourning for President Ford",
    source: "https://www.sec.gov/news/press/2006/2006-222.htm",
  },
  ...["2012-10-29", "2012-10-30"].map((date): CalendarException => ({
    date,
    kind: "closed",
    reason: "Hurricane Sandy",
    source: "https://www.hedgeweek.com/nyse-euronext-close-markets-monday-and-tuesday/",
  })),
  {
    date: "2018-12-05",
    kind: "closed",
    reason: "National Day of Mourning for President George H. W. Bush",
    source:
      "https://ir.theice.com/press/news-details/2018/New-York-Stock-Exchange-to-Honor-President-George-H-W-Bush/default.aspx",
  },
  {
    date: "2025-01-09",
    kind: "closed",
    reason: "National Day of Mourning for President Carter",
    source:
      "https://ir.theice.com/press/news-details/2024/The-New-York-Stock-Exchange-Will-Close-Markets-on-January-9-to-Honor-the-Passing-of-Former-President-Jimmy-Carter-on-National-Day-of-Mourning/default.aspx",
  },
];

/** The New York Stock Exchange. */
const nyse = createCalendar({
  exceptions: nyseExceptions,
  id: "nyse",
  name: "New York Stock Exchange",
  publishedThrough: 2028,
  rules: nyseRules,
  session: {
    closes: Temporal.PlainTime.from("16:00"),
    opens: Temporal.PlainTime.from("09:30"),
    source: "The NYSE's core trading session: https://www.nyse.com/markets/hours-calendars",
    zone: "America/New_York",
  },
  sources: [
    "https://www.nyse.com/markets/hours-calendars",
    "https://github.com/jacobragsdale/basis-ui/blob/main/packages/parallax/crates/parallax-engine/src/calendar.rs",
  ],
});

export { nyse };
