import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { nyse, sifma } from "#dates/index.ts";
import type { Calendar } from "#dates/index.ts";

/* The calendars against the schedules their publishers printed, transcribed into fixtures with each page's address
 * and the day it was fetched. A fixture lists a year's closes and early closes; "closed" or a closing time. Every day
 * a source lists must match the calendar, and in the years it covers in full, every weekday the calendar closes, or
 * closes early, must be listed. Where SIFMA's own sources disagree, `disputes` names the source the calendar follows
 * and why. */

const daySchema = z.object({
  close: z.string().nullable(),
  date: z.iso.date(),
  holiday: z.string(),
});

const sourceSchema = z.object({
  days: z.array(daySchema),
  fetched: z.iso.date(),
  publisher: z.string(),
  scope: z.literal("unscheduled").optional(),
  title: z.string(),
  url: z.url(),
  years: z.array(z.number()),
});

type Source = z.infer<typeof sourceSchema>;

function load(name: string): Source[] {
  const text: unknown = JSON.parse(
    readFileSync(new URL(`fixtures/calendars/${name}`, import.meta.url), "utf8"),
  );
  return z.object({ sources: z.array(sourceSchema) }).parse(text).sources;
}

/** A day as the fixtures write it: "closed", "open", or the early close's time, such as "14:00". */
function shown(calendar: Calendar, date: string): string {
  const day = calendar.day(Temporal.PlainDate.from(date));
  if (day.kind === "early-close") {
    return day.closes.toString({ smallestUnit: "minute" });
  }
  return day.kind;
}

function listedOf(source: Source): Map<string, string> {
  return new Map(source.days.map((day) => [day.date, day.close ?? "closed"]));
}

/** The weekdays of a year that a calendar closes or closes early. */
function irregularDays(calendar: Calendar, year: number): string[] {
  const days: string[] = [];
  for (
    let day = Temporal.PlainDate.from({ day: 1, month: 1, year });
    day.year === year;
    day = day.add({ days: 1 })
  ) {
    if (day.dayOfWeek <= 5 && shown(calendar, day.toString()) !== "open") {
      days.push(day.toString());
    }
  }
  return days;
}

const sifmaSources = load("sifma.json");
const nyseSources = load("nyse.json");

const historyPdf =
  "https://www.sifma.org/wp-content/uploads/2017/08/Misc-US-Historical-Holiday-Market-Recommendations-SIFMA.pdf";
const usArchive = "https://www.sifma.org/resources/guides-playbooks/us-holiday-archive";
const archived = (stamp: string, page: string): string =>
  `https://web.archive.org/web/${stamp}/http://www.sifma.org/services/${page}/`;

/** Entries where one SIFMA source disagrees with the calendar, and the SIFMA source the calendar follows instead. The
 * 2018 compilation of 1996 to 2019 gives some years' schedules as first issued, before SIFMA revised them. */
const disputes: readonly { source: string; date: string; follows: string; why: string }[] = [
  {
    date: "2010-12-31",
    follows: archived("20110823165211", "holiday-schedule-archive-2010"),
    source: historyPdf,
    why: "The 2010 archive page lists the early close before New Year's Day 2011, which fell on a Saturday.",
  },
  {
    date: "2012-07-03",
    follows: archived("20130519101204", "holiday-schedule-archive-2012"),
    source: historyPdf,
    why: "The 2012 archive page lists an early close before Independence Day.",
  },
  {
    date: "2013-07-03",
    follows: archived("20140404005123", "holiday-schedule-archive-2013"),
    source: historyPdf,
    why: "The 2013 archive page lists an early close before Independence Day.",
  },
  {
    date: "2015-04-02",
    follows: usArchive,
    source: historyPdf,
    why: "With the employment report due on Good Friday, SIFMA moved 2015's Good Friday to a noon close.",
  },
  {
    date: "2015-04-03",
    follows: usArchive,
    source: historyPdf,
    why: "With the employment report due on Good Friday, SIFMA moved 2015's Good Friday to a noon close.",
  },
  {
    date: "2015-07-02",
    follows: usArchive,
    source: historyPdf,
    why: "SIFMA's final 2015 schedule recommends no early close before Independence Day.",
  },
  {
    date: "2015-02-16",
    follows: historyPdf,
    source: usArchive,
    why: "The archive page leaves Presidents Day 2015 blank.",
  },
  {
    date: "2016-02-15",
    follows: historyPdf,
    source: usArchive,
    why: "The archive page leaves Presidents Day 2016 blank.",
  },
];

/** Unscheduled closes, which a published holiday schedule may leave out; each is listed by some source. */
const sifmaUnscheduled = [
  "2001-09-11",
  "2001-09-12",
  "2001-09-13",
  "2001-09-14",
  "2001-09-17",
  "2004-06-11",
  "2007-01-02",
  "2012-10-29",
  "2012-10-30",
  "2018-12-05",
  "2025-01-09",
];
/** The NYSE's unscheduled closes; parallax's Rust lists them, and the NYSE tests check them against its fixtures. */
const nyseUnscheduled = new Set(nyse.exceptions.map((exception) => exception.date));

function isDisputed(source: Source, date: string): boolean {
  return disputes.some((dispute) => dispute.source === source.url && dispute.date === date);
}

describe.each([
  ["SIFMA", sifma, sifmaSources, new Set(sifmaUnscheduled)],
  ["the NYSE", nyse, nyseSources, nyseUnscheduled],
] as const)("%s's published schedules", (...[, calendar, sources, unscheduled]) => {
  describe.each(sources.map((source) => [source.title, source] as const))(
    "%s",
    (_title, source) => {
      const listed = listedOf(source);
      const agreed = [...listed].filter(([date]) => !isDisputed(source, date));

      test("every day it lists matches the calendar", () => {
        expect(agreed.filter(([date, close]) => shown(calendar, date) !== close)).toStrictEqual([]);
      });

      test.skipIf(source.years.length === 0)(
        "it lists every irregular day of the years it covers",
        () => {
          const missing = source.years
            .flatMap((year) => irregularDays(calendar, year))
            .filter(
              (date) => !listed.has(date) && !unscheduled.has(date) && !isDisputed(source, date),
            );
          expect(missing).toStrictEqual([]);
        },
      );
    },
  );
});

describe("where SIFMA's sources disagree", () => {
  test.each(disputes.map((dispute) => [`${dispute.date}: ${dispute.why}`, dispute] as const))(
    "%s",
    (_title, dispute) => {
      const { date } = dispute;
      const disputed = sifmaSources.find((source) => source.url === dispute.source);
      const followed = sifmaSources.find((source) => source.url === dispute.follows);
      expect(disputed).toBeDefined();
      expect(followed).toBeDefined();
      const expected =
        followed === undefined ? undefined : (listedOf(followed).get(date) ?? "open");
      expect(shown(sifma, date)).toBe(expected);
      expect(
        disputed === undefined ? undefined : (listedOf(disputed).get(date) ?? "open"),
      ).not.toBe(expected);
    },
  );

  test("each unscheduled close is listed by a source", () => {
    const listedAnywhere = new Set(
      sifmaSources.flatMap((source) => source.days.map((day) => day.date)),
    );
    expect(sifmaUnscheduled.filter((date) => !listedAnywhere.has(date))).toStrictEqual([]);
  });
});

describe("the years tested", () => {
  test("SIFMA's schedules cover every year from 1996 to 2027", () => {
    const years = new Set(sifmaSources.flatMap((source) => source.years));
    const expected = Array.from({ length: 2027 - 1996 + 1 }, (_value, index) => 1996 + index);
    expect(expected.filter((year) => !years.has(year))).toStrictEqual([]);
    expect(sifma.publishedThrough).toBe(2027);
  });

  test("nyse.com's schedules cover every year from 2016 to 2028", () => {
    const years = new Set(nyseSources.flatMap((source) => source.years));
    const expected = Array.from({ length: 2028 - 2016 + 1 }, (_value, index) => 2016 + index);
    expect(expected.filter((year) => !years.has(year))).toStrictEqual([]);
    expect(nyse.publishedThrough).toBe(2028);
  });
});
