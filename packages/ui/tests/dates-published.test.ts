import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { nyse, sifma } from "#dates/index.ts";
import type { Calendar } from "#dates/index.ts";

/* The calendars against the schedules their publishers printed, transcribed into fixtures with each page's address
 * and the day it was fetched. A fixture lists a year's closes and early closes; "closed" or a closing time. Every day
 * a source lists must match the calendar, and in the years it covers in full, every weekday the calendar closes, or
 * closes early, must be listed. Where SIFMA's own sources disagree, the fixture's `disputes` name the source the
 * calendar follows and why, and its `unscheduled` days are closes a published holiday schedule may leave out.
 * Parallax's Rust SIFMA calendar is tested against the same file (crates/parallax-engine/tests/sifma.rs). */

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

const disputeSchema = z.object({
  date: z.iso.date(),
  follows: z.url(),
  source: z.url(),
  why: z.string(),
});

const fixtureSchema = z.object({
  disputes: z.array(disputeSchema).default([]),
  sources: z.array(sourceSchema),
  unscheduled: z.array(z.iso.date()).default([]),
});

function load(name: string): z.infer<typeof fixtureSchema> {
  const text: unknown = JSON.parse(
    readFileSync(new URL(`fixtures/calendars/${name}`, import.meta.url), "utf8"),
  );
  return fixtureSchema.parse(text);
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

const sifmaFixture = load("sifma.json");
const sifmaSources = sifmaFixture.sources;
const nyseSources = load("nyse.json").sources;
const { disputes } = sifmaFixture;
/** Unscheduled closes, which a published holiday schedule may leave out; each is listed by some source. */
const sifmaUnscheduled = sifmaFixture.unscheduled;
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
