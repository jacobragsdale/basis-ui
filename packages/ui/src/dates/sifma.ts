/* SIFMA's recommended closes for the US bond market: the trading of US dollar government, agency, mortgage- and
 * asset-backed, corporate and municipal bonds and money market instruments. SIFMA recommends; each firm decides. The
 * rules below reproduce every schedule SIFMA has published, 1996 to 2027, with the exceptions listed after them.
 *
 * Full closes: New Year's Day, Martin Luther King Jr. Day, Presidents Day, Good Friday, Memorial Day, Juneteenth (from
 * 2022), Independence Day, Labor Day, Columbus Day, Veterans Day, Thanksgiving Day and Christmas Day. A holiday on a
 * Sunday closes the Monday after. A holiday on a Saturday closes the Friday before, except New Year's Day, since that
 * Friday ends the year's books, and Veterans Day: neither gives a day off.
 *
 * Good Friday is a full close unless the Bureau of Labor Statistics publishes the employment report that day. It
 * publishes March's on the first Friday of April, so a Good Friday on 1 to 7 April usually has it, and SIFMA then
 * recommends a noon close instead. SIFMA sets each year's Good Friday by the BLS's release schedule.
 *
 * Early closes, at 2 p.m. New York time: the business day before Good Friday (when Good Friday is a full close),
 * Memorial Day, Independence Day, Christmas Day and New Year's Day, and the day after Thanksgiving. Until 2009-04-03
 * SIFMA recommended twelve a year, adding the business days before Martin Luther King Jr. Day, Presidents Day, Labor
 * Day, Columbus Day, Veterans Day and Thanksgiving Day. Its 2009 policy dropped those and the one before Independence
 * Day, which its schedules have restored every year since 2012 but 2015. */

import { createCalendar } from "./calendar.ts";
import type { YearWriter } from "./calendar.ts";
import { dateOf, monday, observed, thursday } from "./rules.ts";
import type { DateRule } from "./rules.ts";
import { sifmaExceptions, sifmaSources } from "./sifma-exceptions.ts";

const earlyClose = Temporal.PlainTime.from("14:00");
const employmentReportClose = Temporal.PlainTime.from("12:00");
/** SIFMA's 2009 policy cut its early closes from twelve a year to five, effective that day. */
const fiveEarlyClosesFrom = Temporal.PlainDate.from("2009-04-03");
/** The first year SIFMA's schedules again closed early before Independence Day. */
const independenceEveFrom = 2012;
/** Juneteenth became a federal holiday in June 2021, and SIFMA's schedules close for it from 2022. */
const juneteenthFrom = 2022;
const april = 4;
/** The last day of April on which the employment report for March falls. */
const lastEmploymentReportDay = 7;

/** A holiday SIFMA closes for: where it falls, what a Saturday date gives, and the first year it closes. */
interface Holiday {
  readonly name: string;
  readonly rule: DateRule;
  readonly onSaturday?: "friday" | "none";
  readonly from?: number;
}

const newYear: Holiday = {
  name: "New Year's Day",
  onSaturday: "none",
  rule: { day: 1, kind: "fixed", month: 1 },
};
const kingDay: Holiday = {
  name: "Martin Luther King Jr. Day",
  rule: { kind: "weekday", month: 1, nth: 3, weekday: monday },
};
const presidents: Holiday = {
  name: "Presidents Day",
  rule: { kind: "weekday", month: 2, nth: 3, weekday: monday },
};
const goodFriday: Holiday = { name: "Good Friday", rule: { days: -2, kind: "easter" } };
const memorial: Holiday = {
  name: "Memorial Day",
  rule: { kind: "weekday", month: 5, nth: -1, weekday: monday },
};
const juneteenth: Holiday = {
  from: juneteenthFrom,
  name: "Juneteenth",
  onSaturday: "friday",
  rule: { day: 19, kind: "fixed", month: 6 },
};
const independence: Holiday = {
  name: "Independence Day",
  onSaturday: "friday",
  rule: { day: 4, kind: "fixed", month: 7 },
};
const labor: Holiday = {
  name: "Labor Day",
  rule: { kind: "weekday", month: 9, nth: 1, weekday: monday },
};
const columbus: Holiday = {
  name: "Columbus Day",
  rule: { kind: "weekday", month: 10, nth: 2, weekday: monday },
};
const veterans: Holiday = {
  name: "Veterans Day",
  onSaturday: "none",
  rule: { day: 11, kind: "fixed", month: 11 },
};
const thanksgiving: Holiday = {
  name: "Thanksgiving Day",
  rule: { kind: "weekday", month: 11, nth: 4, weekday: thursday },
};
const christmas: Holiday = {
  name: "Christmas Day",
  onSaturday: "friday",
  rule: { day: 25, kind: "fixed", month: 12 },
};

const holidays: readonly Holiday[] = [
  newYear,
  kingDay,
  presidents,
  goodFriday,
  memorial,
  juneteenth,
  independence,
  labor,
  columbus,
  veterans,
  thanksgiving,
  christmas,
];
/** The holidays whose business day before closes early under every policy SIFMA has had. */
const eves: ReadonlySet<Holiday> = new Set([memorial, christmas]);
/** The holidays whose business day before closed early only until 2009-04-03. */
const formerEves: ReadonlySet<Holiday> = new Set([
  kingDay,
  presidents,
  independence,
  labor,
  columbus,
  veterans,
  thanksgiving,
]);

/** A holiday's day off in a year, after the weekend rules, or `undefined` for none. */
function dayOff(holiday: Holiday, year: number): Temporal.PlainDate | undefined {
  if (holiday.from !== undefined && year < holiday.from) {
    return undefined;
  }
  const date = dateOf(holiday.rule, year);
  return holiday.onSaturday === undefined ? date : observed(date, holiday.onSaturday);
}

/** Whether the employment report is due on a Good Friday, so that SIFMA recommends a noon close, not a full one. */
function hasEmploymentReport(year: number): boolean {
  const date = dateOf(goodFriday.rule, year);
  return date.month === april && date.day <= lastEmploymentReportDay;
}

/** Whether the business day `eve` before `holiday` closes early, by the policy of its time. */
function eveClosesEarly(holiday: Holiday, eve: Temporal.PlainDate): boolean {
  if (eves.has(holiday) || (holiday === goodFriday && !hasEmploymentReport(eve.year))) {
    return true;
  }
  if (holiday === independence && eve.year >= independenceEveFrom) {
    return true;
  }
  return formerEves.has(holiday) && Temporal.PlainDate.compare(eve, fiveEarlyClosesFrom) < 0;
}

function writeEves(writer: YearWriter): void {
  for (const holiday of holidays) {
    const date = dayOff(holiday, writer.year);
    const eve = date === undefined ? undefined : writer.businessDayBefore(date);
    if (eve !== undefined && eveClosesEarly(holiday, eve)) {
      writer.closeEarly(eve, earlyClose, `Before ${holiday.name}`);
    }
  }
}

function writeEarlyCloses(writer: YearWriter): void {
  const { year } = writer;
  writeEves(writer);
  if (hasEmploymentReport(year)) {
    writer.closeEarly(
      dateOf(goodFriday.rule, year),
      employmentReportClose,
      "Good Friday, with the employment report",
    );
  }
  const nextNewYear = Temporal.PlainDate.from({ day: 1, month: 1, year: year + 1 });
  writer.closeEarly(writer.businessDayBefore(nextNewYear), earlyClose, `Before ${newYear.name}`);
  writer.closeEarly(
    dateOf(thanksgiving.rule, year).add({ days: 1 }),
    earlyClose,
    `After ${thanksgiving.name}`,
  );
}

function sifmaRules(writer: YearWriter): void {
  const { year } = writer;
  for (const holiday of holidays) {
    const date = dayOff(holiday, year);
    if (date !== undefined && !(holiday === goodFriday && hasEmploymentReport(year))) {
      writer.close(date, holiday.name);
    }
  }
  writeEarlyCloses(writer);
}

/** SIFMA's recommendations for the US bond market, the default calendar. */
const sifma = createCalendar({
  exceptions: sifmaExceptions,
  id: "sifma",
  name: "SIFMA (US bond market)",
  publishedThrough: 2027,
  rules: sifmaRules,
  session: {
    closes: Temporal.PlainTime.from("17:00"),
    opens: Temporal.PlainTime.from("08:00"),
    source:
      "SIFMA recommends closes, not regular hours. 8 a.m. to 5 p.m. New York time are the hours NYSE MKT moved its " +
      "bond session to in 2014, to align it with other bond venues (SEC Release 34-72890): " +
      "https://www.sec.gov/files/rules/sro/nysemkt/2014/34-72890.pdf",
    zone: "America/New_York",
  },
  sources: sifmaSources,
});

export { sifma };
