/* TARGET2, now T2, the Eurosystem's settlement system, whose closing days are the euro's non-settlement days. The ECB
 * fixed them in December 2000 for 2002 onward, and 2000 already had the same six: New Year's Day, Good Friday, Easter
 * Monday, 1 May, Christmas Day and 26 December, plus Saturdays and Sundays. A closing day on a weekend gives no day
 * off, and TARGET2 has no early closes. 2001 also closed on 31 December, for the changeover to euro cash. */

import { createCalendar } from "./calendar.ts";
import type { YearWriter } from "./calendar.ts";
import { dateOf } from "./rules.ts";
import type { DateRule } from "./rules.ts";

const closingDays: readonly (readonly [DateRule, string])[] = [
  [{ day: 1, kind: "fixed", month: 1 }, "New Year's Day"],
  [{ days: -2, kind: "easter" }, "Good Friday"],
  [{ days: 1, kind: "easter" }, "Easter Monday"],
  [{ day: 1, kind: "fixed", month: 5 }, "Labour Day"],
  [{ day: 25, kind: "fixed", month: 12 }, "Christmas Day"],
  [{ day: 26, kind: "fixed", month: 12 }, "26 December"],
];

function target2Rules(writer: YearWriter): void {
  for (const [rule, reason] of closingDays) {
    writer.close(dateOf(rule, writer.year), reason);
  }
}

/** TARGET2's closing days, for euro settlement. */
const target2 = createCalendar({
  exceptions: [
    {
      date: "2001-12-31",
      kind: "closed",
      reason: "The changeover to euro cash",
      source: "https://www.ecb.europa.eu/press/pr/date/2000/html/pr000525_2.en.html",
    },
  ],
  id: "target2",
  name: "TARGET2 (euro settlement)",
  publishedThrough: Number.POSITIVE_INFINITY,
  rules: target2Rules,
  session: {
    closes: Temporal.PlainTime.from("18:00"),
    opens: Temporal.PlainTime.from("07:00"),
    source:
      "The day-trade phase of TARGET2's operating schedule, 7:00 to 18:00 ECB time, which ends at the interbank " +
      "cut-off: https://www.legislation.gov.uk/eudn/2007/7/annex/II/appendix/V",
    zone: "Europe/Berlin",
  },
  sources: [
    "https://www.ecb.europa.eu/press/pr/date/2000/html/pr001214_4.en.html",
    "https://www.ecb.europa.eu/press/pr/date/2000/html/pr000525_2.en.html",
  ],
});

export { target2 };
