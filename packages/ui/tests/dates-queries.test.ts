import { describe, expect, test } from "vite-plus/test";

import {
  addBusinessDays,
  businessDaysBetween,
  businessPeriodToDate,
  closingTime,
  isBusinessDay,
  isEarlyClose,
  lastBusinessDayOfMonth,
  lastBusinessDayOfQuarter,
  marketStatus,
  nextBusinessDay,
  nyse,
  periodEnd,
  periodStart,
  periodToDate,
  previousBusinessDay,
  priorBusinessPeriodEnd,
  priorPeriodEnd,
  settlementDate,
  target2,
} from "#dates/index.ts";
import type { CalendarOption, DateRange, Period, SettlementOptions } from "#dates/index.ts";

// The queries on ISO dates, so each case reads as dates in and dates out.
const date = (day: string): Temporal.PlainDate => Temporal.PlainDate.from(day);
const range = ({ end, start }: DateRange): string => `${start.toString()}..${end.toString()}`;
const businessDay = (day: string, options?: CalendarOption): boolean =>
  isBusinessDay(date(day), options);
const next = (day: string): string => nextBusinessDay(date(day)).toString();
const previous = (day: string): string => previousBusinessDay(date(day)).toString();
const added = (day: string, days: number): string => addBusinessDays(date(day), days).toString();
const between = (start: string, end: string, options?: CalendarOption): number =>
  businessDaysBetween(date(start), date(end), options);
const closing = (day: string, options?: CalendarOption): string | undefined =>
  closingTime(date(day), options)?.toString({ smallestUnit: "minute" });
const lastOfMonth = (day: string): string => lastBusinessDayOfMonth(date(day)).toString();
const lastOfQuarter = (day: string): string => lastBusinessDayOfQuarter(date(day)).toString();
const toDate = (period: Period, asOf: string): string => range(periodToDate(period, date(asOf)));
const priorEnd = (period: Period, asOf: string): string =>
  priorPeriodEnd(period, date(asOf)).toString();
const businessToDate = (period: Period, asOf: string): string =>
  range(businessPeriodToDate(period, date(asOf)));
const priorBusinessEnd = (period: Period, asOf: string, options?: CalendarOption): string =>
  priorBusinessPeriodEnd(period, date(asOf), options).toString();
const settles = (tradeDate: string, options?: SettlementOptions): string =>
  settlementDate(date(tradeDate), options).toString();

describe("business days on SIFMA's calendar, the default", () => {
  test("a weekend, a holiday and an early close", () => {
    expect(["2026-11-07", "2026-11-11", "2026-11-27"].map((day) => businessDay(day))).toStrictEqual(
      [false, false, true],
    );
  });

  test("Veterans Day closes SIFMA but not the NYSE", () => {
    expect(businessDay("2026-11-11")).toBe(false);
    expect(businessDay("2026-11-11", { calendar: nyse })).toBe(true);
  });

  test("the next and previous business days skip weekends and holidays", () => {
    expect(next("2026-07-02")).toBe("2026-07-06");
    expect(previous("2026-07-06")).toBe("2026-07-02");
    expect(next("2026-12-31")).toBe("2027-01-04");
  });

  test.each([
    ["2026-07-01", 1, "2026-07-02"],
    ["2026-07-01", 2, "2026-07-06"],
    ["2026-07-06", -1, "2026-07-02"],
    ["2026-07-06", -3, "2026-06-30"],
    ["2026-07-04", 1, "2026-07-06"],
    ["2026-07-04", -1, "2026-07-02"],
    ["2026-07-04", 0, "2026-07-04"],
    ["2026-01-02", 250, "2027-01-04"],
  ])("%s plus %i business days is %s", (start, days, expected) => {
    expect(added(start, days)).toBe(expected);
  });

  test("a fractional number of days is refused", () => {
    expect(() => added("2026-07-01", 1.5)).toThrow(RangeError);
  });

  test("businessDaysBetween counts the days after the start up to the end, and undoes addBusinessDays", () => {
    expect(between("2026-07-01", "2026-07-06")).toBe(2);
    expect(between("2026-07-06", "2026-07-01")).toBe(-2);
    expect(between("2026-07-01", "2026-07-01")).toBe(0);
    for (const days of [1, 5, 17, 60]) {
      expect(between("2025-12-15", added("2025-12-15", days))).toBe(days);
    }
  });

  test("SIFMA's 2026 has 250 business days, the NYSE's 251 and TARGET2's 256", () => {
    const counts = [
      between("2025-12-31", "2026-12-31"),
      between("2025-12-31", "2026-12-31", { calendar: nyse }),
      between("2025-12-31", "2026-12-31", { calendar: target2 }),
    ];
    expect(counts).toStrictEqual([250, 251, 256]);
  });

  test("early closes and closing times", () => {
    expect(isEarlyClose(date("2026-11-27"))).toBe(true);
    expect(isEarlyClose(date("2026-11-30"))).toBe(false);
    expect(closing("2026-11-27")).toBe("14:00");
    expect(closing("2026-11-27", { calendar: nyse })).toBe("13:00");
    expect(closing("2026-04-03")).toBe("12:00");
    expect(closing("2026-11-30")).toBe("17:00");
    expect(closing("2026-11-26")).toBeUndefined();
  });

  test("the last business day of a month and a quarter", () => {
    expect(lastOfMonth("2026-05-12")).toBe("2026-05-29");
    expect(lastOfMonth("2027-12-01")).toBe("2027-12-31");
    expect(lastOfMonth("2028-12-05")).toBe("2028-12-29");
    expect(lastOfQuarter("2026-02-10")).toBe("2026-03-31");
    expect(lastOfQuarter("2026-11-07")).toBe("2026-12-31");
    expect(lastOfQuarter("2027-01-15")).toBe("2027-03-31");
  });
});

describe("periods for an as-of date", () => {
  test.each([
    ["month", "2026-11-07", "2026-11-01..2026-11-07", "2026-10-31"],
    ["quarter", "2026-11-07", "2026-10-01..2026-11-07", "2026-09-30"],
    ["year", "2026-11-07", "2026-01-01..2026-11-07", "2025-12-31"],
    ["quarter", "2026-03-31", "2026-01-01..2026-03-31", "2025-12-31"],
  ] as const)("%s to date from %s is %s, after %s", (period, asOf, ...expected) => {
    expect([toDate(period, asOf), priorEnd(period, asOf)]).toStrictEqual(expected);
  });

  test.each([
    ["month", "2026-11-07", "2026-11-02..2026-11-06", "2026-10-30"],
    ["quarter", "2026-11-07", "2026-10-01..2026-11-06", "2026-09-30"],
    ["year", "2026-11-07", "2026-01-02..2026-11-06", "2025-12-31"],
    ["year", "2026-01-01", "2025-01-02..2025-12-31", "2024-12-31"],
    ["month", "2026-06-01", "2026-06-01..2026-06-01", "2026-05-29"],
  ] as const)(
    "in business days, %s to date from %s is %s, after %s",
    (period, asOf, ...expected) => {
      expect([businessToDate(period, asOf), priorBusinessEnd(period, asOf)]).toStrictEqual(
        expected,
      );
    },
  );

  test("periods start and end on calendar days", () => {
    expect(periodStart("quarter", date("2026-08-15")).toString()).toBe("2026-07-01");
    expect(periodEnd("quarter", date("2026-08-15")).toString()).toBe("2026-09-30");
    expect(periodEnd("month", date("2028-02-10")).toString()).toBe("2028-02-29");
    expect(periodEnd("year", date("2026-08-15")).toString()).toBe("2026-12-31");
  });

  test("a calendar can be named", () => {
    const options = { calendar: target2 };
    expect(priorBusinessEnd("month", "2026-04-15", options)).toBe("2026-03-31");
    expect(priorBusinessEnd("month", "2027-04-15", options)).toBe("2027-03-31");
    expect(priorBusinessEnd("month", "2024-04-15", options)).toBe("2024-03-28");
  });
});

describe("settlement dates", () => {
  test("T+1 by default, on SIFMA's calendar", () => {
    expect(settles("2026-11-10")).toBe("2026-11-12");
    expect(settles("2026-07-02")).toBe("2026-07-06");
  });

  test("other cycles and calendars", () => {
    expect(settles("2026-11-10", { days: 2 })).toBe("2026-11-13");
    expect(settles("2026-11-10", { calendar: nyse })).toBe("2026-11-11");
    expect(settles("2026-12-23", { calendar: target2, days: 2 })).toBe("2026-12-28");
  });

  test("same-day settlement moves a closed trade date to the next business day", () => {
    expect(settles("2026-11-10", { days: 0 })).toBe("2026-11-10");
    expect(settles("2026-11-11", { days: 0 })).toBe("2026-11-12");
  });

  test("a trade dated on a closed day counts its cycle from the next business day, so T+0 and T+1 differ", () => {
    // 2026-11-14 is a Saturday; 2026-11-11 is Veterans Day, which SIFMA closes.
    expect([settles("2026-11-14", { days: 0 }), settles("2026-11-14")]).toStrictEqual([
      "2026-11-16",
      "2026-11-17",
    ]);
    expect([settles("2026-11-11", { days: 0 }), settles("2026-11-11")]).toStrictEqual([
      "2026-11-12",
      "2026-11-13",
    ]);
  });

  test("a negative or fractional cycle is refused", () => {
    expect(() => settles("2026-11-10", { days: -1 })).toThrow(RangeError);
    expect(() => settles("2026-11-10", { days: 0.5 })).toThrow(RangeError);
  });
});

/** The status at a zoned time, as its state and its next open and close in New York time. */
function statusAt(zoned: string, options?: CalendarOption): string[] {
  const status = marketStatus(Temporal.ZonedDateTime.from(zoned).toInstant(), options);
  return [status.state, status.nextOpen.toString(), status.nextClose.toString()];
}

describe("market status", () => {
  test("SIFMA, open on a Tuesday afternoon", () => {
    expect(statusAt("2026-11-10T15:00[America/New_York]")).toStrictEqual([
      "open",
      "2026-11-12T08:00:00-05:00[America/New_York]",
      "2026-11-10T17:00:00-05:00[America/New_York]",
    ]);
  });

  test("SIFMA, closed on Veterans Day", () => {
    expect(statusAt("2026-11-11T10:00[America/New_York]")).toStrictEqual([
      "closed",
      "2026-11-12T08:00:00-05:00[America/New_York]",
      "2026-11-12T17:00:00-05:00[America/New_York]",
    ]);
  });

  test("SIFMA, in an early close, and after it", () => {
    expect(statusAt("2026-11-27T13:00[America/New_York]")).toStrictEqual([
      "early-close",
      "2026-11-30T08:00:00-05:00[America/New_York]",
      "2026-11-27T14:00:00-05:00[America/New_York]",
    ]);
    const { day } = marketStatus(Temporal.Instant.from("2026-11-27T18:00:00Z"));
    expect(day.kind === "early-close" ? day.reason : "").toBe("After Thanksgiving Day");
    expect(statusAt("2026-11-27T14:00[America/New_York]")[0]).toBe("closed");
  });

  test("the NYSE, before the open and at the close", () => {
    const options = { calendar: nyse };
    expect(statusAt("2026-11-09T09:29[America/New_York]", options)).toStrictEqual([
      "closed",
      "2026-11-09T09:30:00-05:00[America/New_York]",
      "2026-11-09T16:00:00-05:00[America/New_York]",
    ]);
    expect(statusAt("2026-11-09T16:00[America/New_York]", options)[0]).toBe("closed");
  });

  test("the NYSE, over a long weekend", () => {
    expect(statusAt("2026-07-02T20:00[America/New_York]", { calendar: nyse })).toStrictEqual([
      "closed",
      "2026-07-06T09:30:00-04:00[America/New_York]",
      "2026-07-06T16:00:00-04:00[America/New_York]",
    ]);
  });

  test("TARGET2, in Frankfurt's session, shown in New York time", () => {
    expect(statusAt("2026-11-10T09:00[Europe/Berlin]", { calendar: target2 })).toStrictEqual([
      "open",
      "2026-11-11T01:00:00-05:00[America/New_York]",
      "2026-11-10T12:00:00-05:00[America/New_York]",
    ]);
  });

  test("across the change to daylight saving time", () => {
    expect(statusAt("2027-03-12T18:00[America/New_York]", { calendar: nyse })).toStrictEqual([
      "closed",
      "2027-03-15T09:30:00-04:00[America/New_York]",
      "2027-03-15T16:00:00-04:00[America/New_York]",
    ]);
  });
});
