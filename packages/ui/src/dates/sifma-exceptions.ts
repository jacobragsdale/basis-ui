/* The days SIFMA's published recommendations depart from its calendar's rules, each with the notice that says so, and
 * the publications the rules come from. */

import type { CalendarException } from "./calendar.ts";

const schedule = "https://www.sifma.org/resources/guides-playbooks/holiday-schedule";
const archive = "https://www.sifma.org/resources/guides-playbooks/us-holiday-archive";
const history =
  "https://www.sifma.org/wp-content/uploads/2017/08/Misc-US-Historical-Holiday-Market-Recommendations-SIFMA.pdf";
const policy =
  "https://www.sifma.org/news/press-releases/sifma-changes-early-close-recommendation-policy";
const archived20072009 =
  "https://web.archive.org/web/20111105105514/http://www.sifma.org/services/holiday-schedule-2007-2009-archive/";
/** The AP's report of bond trading's return, after "a two-day shutdown". */
const starBulletin = "https://archives.starbulletin.com/2001/09/13/business/market.html";
const emtaSeptember11 =
  "https://www.emta.org/media/k30hlfnq/fd6ed6ea-6fc2-4d8e-9e8e-ea69f71dc58b.pdf";
const emtaSeptember12 =
  "https://www.emta.org/media/ejpcombt/238d6277-6b45-49fd-a9fa-937168053ae1.pdf";
const emtaSeptember13 =
  "https://www.emta.org/media/03ch0pcp/f6d79bd7-1779-4d24-b2e0-6ad5cb2ceafc.pdf";
const emtaSeptember14 =
  "https://www.emta.org/media/kqsbiibl/b3659e87-4624-41d0-8ce4-c00b218804ff.pdf";

/** SIFMA's current schedule, its archive of 2015 onward, its compilation of 1996 to 2019, and its 2009 early-close
 * policy. */
const sifmaSources: readonly string[] = [schedule, archive, history, policy];

/** The days SIFMA's published schedules depart from the rules: unscheduled closes, and the irregular early closes of
 * its earlier years. */
const sifmaExceptions: readonly CalendarException[] = [
  {
    date: "1996-04-05",
    kind: "closed",
    reason: "Good Friday: a full close, although the employment report was published that day",
    source: history,
  },
  {
    date: "1996-07-05",
    kind: "early-close",
    closes: "14:00",
    reason: "After Independence Day",
    source: history,
  },
  {
    date: "1997-11-10",
    kind: "open",
    reason: "No early close before Veterans Day",
    source: history,
  },
  {
    date: "1997-12-26",
    kind: "early-close",
    closes: "14:00",
    reason: "After Christmas Day",
    source: history,
  },
  {
    date: "1998-11-10",
    kind: "open",
    reason: "No early close before Veterans Day",
    source: history,
  },
  {
    date: "1999-04-01",
    kind: "early-close",
    closes: "14:00",
    reason: "Before Good Friday, which closed at noon",
    source: history,
  },
  {
    date: "1999-11-10",
    kind: "open",
    reason: "No early close before Veterans Day",
    source: history,
  },
  {
    date: "1999-12-31",
    kind: "early-close",
    closes: "13:00",
    reason: "Before New Year's Day 2000, at 1 p.m.",
    source: history,
  },
  {
    date: "2001-09-11",
    kind: "closed",
    reason: "The September 11 attacks",
    source: starBulletin,
  },
  {
    date: "2001-09-12",
    kind: "closed",
    reason: "After the September 11 attacks",
    source: emtaSeptember11,
  },
  {
    date: "2001-09-13",
    kind: "early-close",
    closes: "14:00",
    reason: "Reopening after the September 11 attacks",
    source: emtaSeptember12,
  },
  {
    date: "2001-09-14",
    kind: "early-close",
    closes: "14:00",
    reason: "After the September 11 attacks",
    source: emtaSeptember13,
  },
  {
    date: "2001-09-17",
    kind: "early-close",
    closes: "14:00",
    reason: "After the September 11 attacks",
    source: emtaSeptember14,
  },
  {
    date: "2004-01-02",
    kind: "early-close",
    closes: "14:00",
    reason: "After New Year's Day",
    source: history,
  },
  {
    date: "2004-06-11",
    kind: "closed",
    reason: "National Day of Mourning for President Reagan",
    source:
      "https://web.archive.org/web/2004/http://money.cnn.com/2004/06/07/markets/nyse_reagan/index.htm",
  },
  {
    date: "2004-11-10",
    kind: "open",
    reason: "No early close before Veterans Day",
    source: history,
  },
  {
    date: "2007-01-02",
    kind: "early-close",
    closes: "14:00",
    reason: "National Day of Mourning for President Ford",
    source:
      "https://mondovisione.com/news/sifma-recommends-early-market-close-on-tuesday-january-2-2007-for-trading-of-us--2011124",
  },
  {
    date: "2007-04-06",
    kind: "early-close",
    closes: "11:00",
    reason: "Good Friday, with the employment report, at 11 a.m.",
    source: archived20072009,
  },
  {
    date: "2012-10-29",
    kind: "early-close",
    closes: "12:00",
    reason: "Hurricane Sandy",
    source: history,
  },
  { date: "2012-10-30", kind: "closed", reason: "Hurricane Sandy", source: history },
  {
    date: "2015-07-02",
    kind: "open",
    reason: "No early close before Independence Day",
    source: archive,
  },
  {
    date: "2018-12-05",
    kind: "closed",
    reason: "National Day of Mourning for President George H. W. Bush",
    source: history,
  },
  {
    date: "2025-01-09",
    kind: "early-close",
    closes: "14:00",
    reason: "National Day of Mourning for President Carter",
    source: "https://www.sifma.org/resources/guides-playbooks/unscheduled-close-market-matrix",
  },
];

export { sifmaExceptions, sifmaSources };
